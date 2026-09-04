<?php
/**
 * Server-side tracker markup — the rewriting engine (debt Д10).
 *
 * WHY THIS EXISTS
 *
 * The browser blocking engine in ck-core.js patches document.createElement,
 * Element.prototype.setAttribute and the HTMLScriptElement src setter, which
 * covers every tracker INJECTED by other JavaScript. It cannot cover a plain
 * `<script src="https://mc.yandex.ru/metrika/tag.js">` written straight into
 * the page: the HTML parser starts that request before the first line of our
 * code runs (measured in debt Д9: request at 14 ms, our script at 18 ms). The
 * gap is negative, and no client-side trick closes it.
 *
 * The server is earlier than the parser by definition. Rewriting the tag in the
 * HTML before it ever leaves PHP turns a static tracker tag into exactly the
 * manual markup the README documents, and the existing client picks it up.
 *
 * WHY REGEX AND NOT A DOM PARSER
 *
 * A DOMDocument round-trip re-serializes the whole page: it mangles HTML5 void
 * elements, moves content around when the markup is not well-formed, and
 * requires libxml, which is not guaranteed on shared hosting. The page is
 * somebody else's theme output; it is not ours to normalize. The rules here are
 * deliberately narrow — one regex over `<script ...>` open tags and one over
 * `<iframe ...>` — and anything not understood is left byte-identical.
 *
 * CONTRACT WITH ck-core.js (applyConsentToDom / reviveScript)
 *
 *  - script: `type="text/plain" data-ck="<cat>" data-ck-src="<orig src>"`, the
 *    `src` attribute removed. The core selects
 *    `script[type="text/plain"][data-ck]` and revives it by copying attributes
 *    onto a fresh element, taking the URL from data-src|data-ck-src.
 *  - the original `type`, when it was something other than a classic script
 *    (e.g. `module`), is carried in `data-ck-type` — reviveScript restores the
 *    real type only from that attribute, so dropping it would turn a module
 *    into a classic script.
 *  - iframe: `data-ck="<cat>" data-src="<orig src>"`, `src` REMOVED. The core
 *    selects `iframe[data-ck][data-src]` and bails out when `src` is still
 *    present, so leaving it would permanently freeze the iframe.
 *  - `data-ck-blocked` and `data-ck-restored` are the runtime engine's own
 *    bookkeeping and are never emitted here.
 *
 * This file is pure: no WordPress function is called anywhere in it, so
 * tests/rewrite.test.php can exercise it under a bare `php` CLI.
 *
 * @package ConsentKit
 */

// Block direct file access. ABSPATH is absent under the CLI test, which loads
// this file with require() after defining it.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Load the generated tracker database.
 *
 * @return array{hosts: array<string, string>, paths: array<string, string>}
 */
function consentkit_tracker_db() {
	static $db = null;

	if ( null !== $db ) {
		return $db;
	}

	$file = __DIR__ . '/hostdb.php';
	$db   = array(
		'hosts' => array(),
		'paths' => array(),
	);

	if ( is_readable( $file ) ) {
		$loaded = require $file;
		if ( is_array( $loaded ) && isset( $loaded['hosts'], $loaded['paths'] ) && is_array( $loaded['hosts'] ) && is_array( $loaded['paths'] ) ) {
			$db = $loaded;
		}
	}

	return $db;
}

/**
 * Classify a URL — the PHP twin of categoryForUrl() in src/ck-core.js.
 *
 * Host matching is suffix based, so a bare registrable domain also covers its
 * subdomains; the port is stripped, matching is case-insensitive. Path matching
 * is a substring test against the WHOLE lowercased URL (not just the path
 * component) — that is what the client does after resolving the URL, and it is
 * what lets '/gtag/js' distinguish two very different scripts served from the
 * same googletagmanager.com host.
 *
 * A URL without a host (relative, e.g. "/js/analytics.js") can only ever match
 * by path: there is no reliable way to know the site's own hostname here, and
 * guessing it would risk rewriting first-party scripts that merely share a name
 * with a tracker.
 *
 * @param string                                                   $url Raw src attribute value.
 * @param array{hosts: array<string,string>, paths: array<string,string>} $db  Tracker database.
 * @return string|null Category, or null when the URL is not a known tracker.
 */
function consentkit_category_for_url( $url, $db ) {
	if ( ! is_string( $url ) || '' === $url ) {
		return null;
	}

	$url = trim( $url );

	// Never touch inline data/blob/javascript URLs: there is no host to match
	// and a substring hit inside base64 payload would be pure noise.
	if ( preg_match( '#^(?:data|blob|javascript|about):#i', $url ) ) {
		return null;
	}

	$host = '';
	// Absolute ("https://host/…") or protocol-relative ("//host/…").
	if ( preg_match( '#^(?:[a-z][a-z0-9+.\-]*:)?//([^/?\#]+)#i', $url, $m ) ) {
		$authority = $m[1];
		// Strip userinfo, then the port.
		$at = strrpos( $authority, '@' );
		if ( false !== $at ) {
			$authority = substr( $authority, $at + 1 );
		}
		$authority = preg_replace( '/:\d+$/', '', $authority );
		$host      = strtolower( (string) $authority );
	}

	if ( '' !== $host ) {
		foreach ( $db['hosts'] as $suffix => $category ) {
			if ( $host === $suffix ) {
				return $category;
			}
			$tail = '.' . $suffix;
			if ( strlen( $host ) > strlen( $suffix ) && substr( $host, -strlen( $tail ) ) === $tail ) {
				return $category;
			}
		}
	}

	$low = strtolower( $url );
	foreach ( $db['paths'] as $fragment => $category ) {
		if ( '' !== $fragment && false !== strpos( $low, $fragment ) ) {
			return $category;
		}
	}

	return null;
}

/**
 * Parse the attributes of an HTML open tag into name => value.
 *
 * Values keep their raw (still HTML-encoded) form: they are written back into
 * the document verbatim, so decoding and re-encoding would only introduce
 * differences. Names are lowercased, since HTML attribute names are
 * case-insensitive. A bare attribute (`defer`) gets the value true.
 *
 * @param string $attr_source The text between the tag name and the closing '>'.
 * @return array<string, string|true>
 */
function consentkit_parse_attributes( $attr_source ) {
	$attrs = array();

	$re = '/([^\s"\'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+)))?/';

	if ( ! preg_match_all( $re, $attr_source, $matches, PREG_SET_ORDER ) ) {
		return $attrs;
	}

	foreach ( $matches as $m ) {
		$name = strtolower( $m[1] );
		if ( '' === $name || isset( $attrs[ $name ] ) ) {
			continue;
		}

		if ( ! isset( $m[2] ) && ! isset( $m[3] ) && ! isset( $m[4] ) ) {
			$attrs[ $name ] = true;
			continue;
		}

		if ( isset( $m[2] ) && '' !== $m[2] ) {
			$attrs[ $name ] = $m[2];
		} elseif ( isset( $m[3] ) && '' !== $m[3] ) {
			$attrs[ $name ] = $m[3];
		} elseif ( isset( $m[4] ) && '' !== $m[4] ) {
			$attrs[ $name ] = $m[4];
		} else {
			// name="" — an explicitly empty value, not a bare attribute.
			$attrs[ $name ] = '';
		}
	}

	return $attrs;
}

/**
 * Serialize an attribute map back into an open tag.
 *
 * Values are emitted double-quoted. A value that already contains a double
 * quote is impossible here — it could not have been parsed out of a
 * double-quoted attribute — but any that arrives from a single-quoted source
 * gets its quotes encoded so the tag cannot be broken.
 *
 * @param string                     $tag   Tag name.
 * @param array<string, string|true> $attrs Attribute map.
 * @param bool                       $self_closing Whether to emit ' /'.
 * @return string
 */
function consentkit_build_tag( $tag, $attrs, $self_closing = false ) {
	$out = '<' . $tag;

	foreach ( $attrs as $name => $value ) {
		if ( true === $value ) {
			$out .= ' ' . $name;
			continue;
		}
		$out .= ' ' . $name . '="' . str_replace( '"', '&quot;', (string) $value ) . '"';
	}

	return $out . ( $self_closing ? ' />' : '>' );
}

/**
 * Decide whether a script/iframe tag must be left alone regardless of its URL.
 *
 * @param array<string, string|true> $attrs Attribute map.
 * @param string                     $self_url_fragment A URL fragment identifying ConsentKit's own assets.
 * @return bool
 */
function consentkit_tag_is_exempt( $attrs, $self_url_fragment ) {
	// Explicit opt-out by the site author.
	if ( isset( $attrs['data-ck-ignore'] ) ) {
		return true;
	}

	// Already marked up — by hand per the README contract, or by an earlier
	// pass. Re-marking would move the src twice and lose the original.
	if ( isset( $attrs['data-ck'] ) || isset( $attrs['data-ck-src'] ) || isset( $attrs['data-src'] ) ) {
		return true;
	}

	// ConsentKit's own assets: blocking the blocking engine.
	$src = isset( $attrs['src'] ) && is_string( $attrs['src'] ) ? $attrs['src'] : '';
	if ( '' !== $src ) {
		if ( '' !== $self_url_fragment && false !== strpos( $src, $self_url_fragment ) ) {
			return true;
		}
		// Belt and braces for a moved/renamed plugin directory.
		if ( preg_match( '#/(?:ck-core|ck-ui|ck-locales|ck-debug|ck-debug-loader|ck-saas)\.js#i', $src ) ) {
			return true;
		}
	}

	return false;
}

/**
 * Rewrite one `<script>` open tag if it points at a known tracker.
 *
 * @param string $full  The whole matched open tag.
 * @param array{hosts: array<string,string>, paths: array<string,string>} $db Tracker database.
 * @param string $self_url_fragment ConsentKit's own asset URL fragment.
 * @return string The tag, rewritten or unchanged.
 */
function consentkit_rewrite_script_tag( $full, $db, $self_url_fragment ) {
	if ( ! preg_match( '#^<script([^>]*)>$#is', $full, $m ) ) {
		return $full;
	}

	$attrs = consentkit_parse_attributes( $m[1] );

	// Inline scripts have no src: nothing to defer, and rewriting the body is
	// out of scope (the client cannot restore an inline tracker's side effects
	// any better than the author can gate them).
	if ( ! isset( $attrs['src'] ) || ! is_string( $attrs['src'] ) || '' === trim( $attrs['src'] ) ) {
		return $full;
	}

	if ( consentkit_tag_is_exempt( $attrs, $self_url_fragment ) ) {
		return $full;
	}

	// A tag already neutralized by the author (type="text/plain") is left as it
	// is: it is not executing anyway, and the author's own data-ck decides.
	if ( isset( $attrs['type'] ) && is_string( $attrs['type'] ) && 'text/plain' === strtolower( trim( $attrs['type'] ) ) ) {
		return $full;
	}

	$src      = $attrs['src'];
	$category = consentkit_category_for_url( html_entity_decode( $src, ENT_QUOTES, 'UTF-8' ), $db );

	if ( null === $category ) {
		return $full;
	}

	$rebuilt = array();
	foreach ( $attrs as $name => $value ) {
		if ( 'src' === $name ) {
			// Replaced below, in place, so attribute order survives.
			$rebuilt['type']        = 'text/plain';
			$rebuilt['data-ck']     = $category;
			$rebuilt['data-ck-src'] = $src;
			continue;
		}
		if ( 'type' === $name ) {
			// Carried across for reviveScript(): it restores the real type
			// only from data-ck-type. A classic script needs no marker.
			$original = is_string( $value ) ? trim( $value ) : '';
			if ( '' !== $original && ! preg_match( '#^(?:text/javascript|application/javascript|text/ecmascript|application/ecmascript)$#i', $original ) ) {
				$rebuilt['data-ck-type'] = $original;
			}
			continue;
		}
		$rebuilt[ $name ] = $value;
	}

	// src was the last attribute or absent from the loop order — make sure the
	// markup is complete either way.
	if ( ! isset( $rebuilt['data-ck-src'] ) ) {
		$rebuilt['type']        = 'text/plain';
		$rebuilt['data-ck']     = $category;
		$rebuilt['data-ck-src'] = $src;
	}

	return consentkit_build_tag( 'script', $rebuilt );
}

/**
 * Rewrite one `<iframe>` open tag if it points at a known tracker host.
 *
 * @param string $full The whole matched open tag.
 * @param array{hosts: array<string,string>, paths: array<string,string>} $db Tracker database.
 * @param string $self_url_fragment ConsentKit's own asset URL fragment.
 * @return string
 */
function consentkit_rewrite_iframe_tag( $full, $db, $self_url_fragment ) {
	if ( ! preg_match( '#^<iframe([^>]*?)(/?)>$#is', $full, $m ) ) {
		return $full;
	}

	$attrs        = consentkit_parse_attributes( $m[1] );
	$self_closing = ( '/' === $m[2] );

	if ( ! isset( $attrs['src'] ) || ! is_string( $attrs['src'] ) || '' === trim( $attrs['src'] ) ) {
		return $full;
	}

	if ( consentkit_tag_is_exempt( $attrs, $self_url_fragment ) ) {
		return $full;
	}

	$src      = $attrs['src'];
	$category = consentkit_category_for_url( html_entity_decode( $src, ENT_QUOTES, 'UTF-8' ), $db );

	if ( null === $category ) {
		return $full;
	}

	$rebuilt = array();
	foreach ( $attrs as $name => $value ) {
		if ( 'src' === $name ) {
			// src is REMOVED: applyConsentToDom() skips any iframe that still
			// carries one, so keeping it would freeze the frame forever.
			$rebuilt['data-ck']  = $category;
			$rebuilt['data-src'] = $src;
			continue;
		}
		$rebuilt[ $name ] = $value;
	}

	return consentkit_build_tag( 'iframe', $rebuilt, $self_closing );
}

/**
 * Rewrite known tracker tags in a complete HTML document.
 *
 * Regions whose contents are not markup are masked out before matching and
 * restored afterwards, so a tag written inside them is never rewritten:
 *
 *  - `<script>…</script>` bodies (lazy-loader templates routinely build tracker
 *    tags as strings; rewriting the string would corrupt the JavaScript);
 *  - `<textarea>` and `<pre>` (documentation and code samples showing a tracker
 *    snippet — a site explaining ConsentKit must not have its example mangled);
 *  - HTML comments, including conditional comments.
 *
 * On ANY failure — a PCRE backtrack limit, an unexpected structure — the input
 * is returned byte-for-byte. A page that renders with an unblocked tracker is a
 * compliance problem; a page that does not render at all is an outage.
 *
 * @param string $html              Complete HTML document.
 * @param string $self_url_fragment URL fragment identifying ConsentKit's own assets.
 * @param array|null $db            Tracker database; defaults to the generated one.
 * @return string
 */
function consentkit_rewrite_html( $html, $self_url_fragment = '', $db = null ) {
	if ( ! is_string( $html ) || '' === $html ) {
		return $html;
	}

	if ( null === $db ) {
		$db = consentkit_tracker_db();
	}

	if ( empty( $db['hosts'] ) && empty( $db['paths'] ) ) {
		return $html;
	}

	// Cheap pre-filter: no script/iframe tag at all, nothing to do.
	if ( false === stripos( $html, '<script' ) && false === stripos( $html, '<iframe' ) ) {
		return $html;
	}

	$placeholders = array();
	$counter      = 0;

	// A sentinel that cannot occur in HTML output: NUL is not valid in a
	// document, so a collision with page content is impossible.
	$mask = function ( $matches ) use ( &$placeholders, &$counter ) {
		$key                  = "\0CK" . $counter . "\0";
		$counter++;
		$placeholders[ $key ] = $matches[0];
		return $key;
	};

	$masked = $html;

	// ORDER MATTERS. Comments, <pre> and <textarea> are masked FIRST, so a
	// script tag written inside one of them is swallowed whole and never
	// reaches the script pattern below — a documentation page showing a
	// tracker snippet must come out byte-identical. Script bodies are masked
	// last, and those placeholders are the only ones whose open tag is then
	// rewritten.
	$mask_patterns = array(
		'#<!--.*?-->#s',
		'#<textarea\b[^>]*>.*?</textarea\s*>#is',
		'#<pre\b[^>]*>.*?</pre\s*>#is',
		// Script bodies, including the open and close tags. Non-greedy, and an
		// unterminated <script> simply does not match, leaving it visible to
		// the rewriter below — which is correct: a parser-visible open tag.
		'#<script\b[^>]*>.*?</script\s*>#is',
	);

	foreach ( $mask_patterns as $pattern ) {
		$result = preg_replace_callback( $pattern, $mask, $masked );
		if ( null === $result ) {
			// PCRE failure (backtrack/recursion limit on a very large page).
			return $html;
		}
		$masked = $result;
	}

	// Script open tags now only survive OUTSIDE a masked <script>…</script>
	// pair, i.e. tags whose closing tag is missing. Handle iframes here and
	// process the masked script blocks separately below.
	$masked = preg_replace_callback(
		'#<iframe\b[^>]*?/?>#is',
		function ( $matches ) use ( $db, $self_url_fragment ) {
			return consentkit_rewrite_iframe_tag( $matches[0], $db, $self_url_fragment );
		},
		$masked
	);

	if ( null === $masked ) {
		return $html;
	}

	// Rewrite the open tag of each masked script block. The body is untouched:
	// only the first '>' -terminated open tag is considered.
	foreach ( $placeholders as $key => $chunk ) {
		if ( 0 !== stripos( $chunk, '<script' ) ) {
			continue;
		}

		$rewritten = preg_replace_callback(
			'#^<script\b[^>]*>#is',
			function ( $matches ) use ( $db, $self_url_fragment ) {
				return consentkit_rewrite_script_tag( $matches[0], $db, $self_url_fragment );
			},
			$chunk,
			1
		);

		if ( null !== $rewritten ) {
			$placeholders[ $key ] = $rewritten;
		}
	}

	// Restore the masked regions. A later pattern can have swallowed an earlier
	// placeholder (a comment inside <pre>, say), so one strtr() is not enough:
	// repeat until nothing changes. The loop is bounded by the number of
	// patterns plus slack, and any leftover sentinel means the masking went
	// wrong — in which case the original document is returned untouched rather
	// than one with a NUL marker in it.
	if ( ! empty( $placeholders ) ) {
		for ( $pass = 0; $pass < 8; $pass++ ) {
			$restored = strtr( $masked, $placeholders );
			if ( $restored === $masked ) {
				break;
			}
			$masked = $restored;
		}

		if ( false !== strpos( $masked, "\0CK" ) ) {
			return $html;
		}
	}

	return $masked;
}
