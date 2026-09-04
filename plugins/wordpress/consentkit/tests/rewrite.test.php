<?php
/**
 * ConsentKit — tests for the server-side tracker markup (debt Д10).
 *
 * A plain PHP CLI script, not PHPUnit: the plugin has no Composer dependency
 * tree and adding one for a dozen assertions would be worse than the assertions.
 * The engine in includes/rewrite.php is deliberately free of WordPress calls,
 * which is what makes this runnable with nothing but `php`.
 *
 * Run:
 *   php plugins/wordpress/consentkit/tests/rewrite.test.php
 *
 * Or, without a local PHP (a Mac usually has none since Monterey):
 *   docker run --rm -v "$PWD/plugins/wordpress/consentkit":/p:ro php:8.3-cli \
 *     php /p/tests/rewrite.test.php
 *
 * Exit code 0 = every case passed, 1 = at least one failed.
 *
 * @package ConsentKit
 */

// includes/rewrite.php guards on ABSPATH to stay unreachable over HTTP. The
// test is the one legitimate caller outside WordPress.
define( 'ABSPATH', __DIR__ );

require __DIR__ . '/../includes/rewrite.php';

$consentkit_db = require __DIR__ . '/../includes/hostdb.php';

/** Fragment standing in for CONSENTKIT_URL on a live install. */
const CK_SELF = 'https://example.com/wp-content/plugins/consentkit/assets/';

$consentkit_passed = 0;
$consentkit_failed = 0;

/**
 * Assert that rewriting $input produces $expected.
 *
 * @param string $name     Case name.
 * @param string $input    Input HTML.
 * @param string $expected Expected output HTML.
 * @return void
 */
function ck_assert_rewrite( $name, $input, $expected ) {
	global $consentkit_db, $consentkit_passed, $consentkit_failed;

	$actual = consentkit_rewrite_html( $input, CK_SELF, $consentkit_db );

	if ( $actual === $expected ) {
		$consentkit_passed++;
		echo "  ok   $name\n";
		return;
	}

	$consentkit_failed++;
	echo "  FAIL $name\n";
	echo "       expected: $expected\n";
	echo "       actual:   $actual\n";
}

/**
 * Assert that the input passes through completely unchanged.
 *
 * @param string $name  Case name.
 * @param string $input Input HTML.
 * @return void
 */
function ck_assert_unchanged( $name, $input ) {
	ck_assert_rewrite( $name, $input, $input );
}

/**
 * Assert a plain boolean condition.
 *
 * @param string $name      Case name.
 * @param bool   $condition Condition.
 * @param string $detail    Message shown on failure.
 * @return void
 */
function ck_assert_true( $name, $condition, $detail = '' ) {
	global $consentkit_passed, $consentkit_failed;

	if ( $condition ) {
		$consentkit_passed++;
		echo "  ok   $name\n";
		return;
	}

	$consentkit_failed++;
	echo "  FAIL $name\n";
	if ( '' !== $detail ) {
		echo "       $detail\n";
	}
}

echo "ConsentKit server-side markup — PHP " . PHP_VERSION . "\n\n";

/* ------------------------------------------------------------------ database */

echo "database\n";

ck_assert_true(
	'hostdb.php loads with hosts and paths',
	is_array( $consentkit_db ) && ! empty( $consentkit_db['hosts'] ) && ! empty( $consentkit_db['paths'] ),
	'includes/hostdb.php did not return the expected structure — re-run tools/export-hostdb.mjs'
);

ck_assert_true(
	'every category is one of the four known ones',
	count(
		array_diff(
			array_unique( array_merge( array_values( $consentkit_db['hosts'] ), array_values( $consentkit_db['paths'] ) ) ),
			array( 'necessary', 'functional', 'analytics', 'marketing' )
		)
	) === 0
);

/* ------------------------------------------------------------ classification */

echo "\nclassification (consentkit_category_for_url)\n";

$ck_url_cases = array(
	// URL, expected category.
	array( 'https://mc.yandex.ru/metrika/tag.js', 'analytics' ),
	array( 'https://connect.facebook.net/en_US/fbevents.js', 'marketing' ),
	array( 'https://analytics.tiktok.com/i18n/pixel/events.js', 'marketing' ),
	array( 'https://static.hotjar.com/c/hotjar-123.js', 'analytics' ),
	array( 'https://www.googletagmanager.com/gtag/js?id=G-ABC123', 'analytics' ),
	array( 'https://cdn.example.com/app.js', null ),
	array( 'https://notgoogle-analytics.com/x.js', null ),
	array( '//mc.yandex.ru/metrika/tag.js', 'analytics' ),
	array( 'https://MC.YANDEX.RU/metrika/tag.js', 'analytics' ),
	array( 'https://mc.yandex.ru:443/metrika/tag.js', 'analytics' ),
	array( '/local/gtag/js?id=G-1', 'analytics' ),
	array( '/wp-content/themes/x/app.js', null ),
	array( 'data:text/javascript;base64,Zm9v', null ),
);

foreach ( $ck_url_cases as $case ) {
	list( $url, $want ) = $case;
	$got                = consentkit_category_for_url( $url, $consentkit_db );
	ck_assert_true(
		sprintf( '%s => %s', $url, ( null === $want ) ? 'null' : $want ),
		$got === $want,
		sprintf( 'got %s', ( null === $got ) ? 'null' : $got )
	);
}

/* --------------------------------------------------------- script rewriting */

echo "\nscript tags rewritten\n";

ck_assert_rewrite(
	'Yandex Metrica => analytics',
	'<script src="https://mc.yandex.ru/metrika/tag.js"></script>',
	'<script type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js"></script>'
);

ck_assert_rewrite(
	'gtag.js => analytics (matched by path)',
	'<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>',
	'<script async type="text/plain" data-ck="analytics" data-ck-src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>'
);

ck_assert_rewrite(
	'Meta pixel => marketing',
	'<script src="https://connect.facebook.net/en_US/fbevents.js"></script>',
	'<script type="text/plain" data-ck="marketing" data-ck-src="https://connect.facebook.net/en_US/fbevents.js"></script>'
);

ck_assert_rewrite(
	'TikTok pixel => marketing',
	'<script src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>',
	'<script type="text/plain" data-ck="marketing" data-ck-src="https://analytics.tiktok.com/i18n/pixel/events.js"></script>'
);

ck_assert_rewrite(
	'Intercom => functional',
	'<script src="https://widget.intercom.io/widget/abc"></script>',
	'<script type="text/plain" data-ck="functional" data-ck-src="https://widget.intercom.io/widget/abc"></script>'
);

ck_assert_rewrite(
	'other attributes and their order survive',
	'<script id="ga" async defer crossorigin="anonymous" src="https://www.google-analytics.com/analytics.js" data-x="1"></script>',
	'<script id="ga" async defer crossorigin="anonymous" type="text/plain" data-ck="analytics" data-ck-src="https://www.google-analytics.com/analytics.js" data-x="1"></script>'
);

ck_assert_rewrite(
	'single-quoted src',
	"<script src='https://mc.yandex.ru/metrika/tag.js'></script>",
	'<script type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js"></script>'
);

ck_assert_rewrite(
	'unquoted src',
	'<script src=https://mc.yandex.ru/metrika/tag.js></script>',
	'<script type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js"></script>'
);

ck_assert_rewrite(
	'uppercase SCRIPT / SRC',
	'<SCRIPT SRC="https://mc.yandex.ru/metrika/tag.js"></SCRIPT>',
	'<script type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js"></SCRIPT>'
);

ck_assert_rewrite(
	'type="module" is carried in data-ck-type',
	'<script type="module" src="https://mc.yandex.ru/metrika/tag.js"></script>',
	'<script data-ck-type="module" type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js"></script>'
);

ck_assert_rewrite(
	'type="text/javascript" is dropped, not carried',
	'<script type="text/javascript" src="https://mc.yandex.ru/metrika/tag.js"></script>',
	'<script type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js"></script>'
);

ck_assert_rewrite(
	'two trackers in one document',
	'<html><head><script src="https://mc.yandex.ru/metrika/tag.js"></script>' .
	'<script src="https://connect.facebook.net/en_US/fbevents.js"></script></head></html>',
	'<html><head><script type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js"></script>' .
	'<script type="text/plain" data-ck="marketing" data-ck-src="https://connect.facebook.net/en_US/fbevents.js"></script></head></html>'
);

ck_assert_rewrite(
	'the script body is left untouched',
	'<script src="https://mc.yandex.ru/metrika/tag.js">/* fallback */</script>',
	'<script type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js">/* fallback */</script>'
);

/* --------------------------------------------------------- script left alone */

echo "\nscript tags left alone\n";

ck_assert_unchanged(
	'unknown host',
	'<script src="https://cdn.example.com/app.js"></script>'
);

ck_assert_unchanged(
	'a host merely ending in a tracker name is not a suffix match',
	'<script src="https://notgoogle-analytics.com/x.js"></script>'
);

/* The container is deliberately NOT in HOST_DB (see the long comment in
   src/ck-core.js and the v0.3.2 decision in SPEC.md): gtm.js delivers tags that
   themselves obey Consent Mode, and blocking it breaks that model for every GTM
   site. Only /gtag/js — a direct GA4 install — is blocked, by path. */
ck_assert_unchanged(
	'the GTM container is NOT blocked (v0.3.2 decision)',
	'<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC"></script>'
);

ck_assert_unchanged(
	'data-ck-ignore opts the tag out',
	'<script data-ck-ignore src="https://mc.yandex.ru/metrika/tag.js"></script>'
);

ck_assert_unchanged(
	'already marked up by hand (type=text/plain + data-ck)',
	'<script type="text/plain" data-ck="analytics" data-src="https://mc.yandex.ru/metrika/tag.js"></script>'
);

ck_assert_unchanged(
	'rewriting is idempotent — our own output is not re-marked',
	'<script type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js"></script>'
);

ck_assert_unchanged(
	"ConsentKit's own asset (by plugin URL)",
	'<script src="' . CK_SELF . 'ck-core.js?ver=123"></script>'
);

ck_assert_unchanged(
	"ConsentKit's own asset (by file name, moved directory)",
	'<script src="https://cdn.example.com/vendor/ck-core.js"></script>'
);

ck_assert_unchanged(
	'inline script with no src',
	'<script>window.dataLayer=window.dataLayer||[];</script>'
);

ck_assert_unchanged(
	'a tracker URL inside an inline script body is a string, not a tag',
	'<script>var s="<script src=\'https://mc.yandex.ru/metrika/tag.js\'><\/script>";</script>'
);

ck_assert_unchanged(
	'a tracker tag inside an HTML comment',
	'<!-- <script src="https://mc.yandex.ru/metrika/tag.js"></script> -->'
);

ck_assert_unchanged(
	'a tracker tag shown as an example inside <pre>',
	'<pre><script src="https://mc.yandex.ru/metrika/tag.js"></script></pre>'
);

ck_assert_unchanged(
	'a tracker tag inside <textarea>',
	'<textarea><script src="https://mc.yandex.ru/metrika/tag.js"></script></textarea>'
);

ck_assert_unchanged(
	'a tracker tag inside a comment nested in <pre> (nested masking)',
	'<pre><!-- <script src="https://mc.yandex.ru/metrika/tag.js"></script> --></pre>'
);

ck_assert_unchanged(
	'empty src',
	'<script src=""></script>'
);

ck_assert_true(
	'no masking sentinel ever survives into the output',
	false === strpos(
		consentkit_rewrite_html(
			'<pre><!-- x --></pre><textarea><script src="https://mc.yandex.ru/metrika/tag.js"></script></textarea>' .
			'<script src="https://mc.yandex.ru/metrika/tag.js"></script>',
			CK_SELF,
			$consentkit_db
		),
		'CK0'
	)
);

/* --------------------------------------------------------------- iframes */

echo "\niframes\n";

/* NOTE: youtube.com / player.vimeo.com are NOT in HOST_DB — the client has no
   embed hosts at all today (reported as a follow-up; adding them by hand here
   would fork the source of truth). The iframe path is therefore exercised with
   a host that IS in the database. */
ck_assert_rewrite(
	'iframe of a known host => data-src, src removed',
	'<iframe src="https://www.facebook.net/plugins/page.php" width="340"></iframe>',
	'<iframe data-ck="marketing" data-src="https://www.facebook.net/plugins/page.php" width="340"></iframe>'
);

ck_assert_rewrite(
	'self-closing iframe keeps its slash',
	'<iframe src="https://www.facebook.net/plugins/page.php" />',
	'<iframe data-ck="marketing" data-src="https://www.facebook.net/plugins/page.php" />'
);

ck_assert_true(
	'the rewritten iframe carries no src attribute',
	! preg_match(
		'/\ssrc=/',
		consentkit_rewrite_html( '<iframe src="https://www.facebook.net/plugins/page.php"></iframe>', CK_SELF, $consentkit_db )
	),
	'applyConsentToDom() skips any iframe that still has src — it would never be restored'
);

ck_assert_unchanged(
	'iframe of an unknown host',
	'<iframe src="https://maps.example.com/embed"></iframe>'
);

ck_assert_unchanged(
	'iframe with data-ck-ignore',
	'<iframe data-ck-ignore src="https://www.facebook.net/plugins/page.php"></iframe>'
);

/* ------------------------------------------------------- malformed / robust */

echo "\nmalformed and edge-case input\n";

ck_assert_unchanged(
	'empty document',
	''
);

ck_assert_unchanged(
	'plain text with no tags',
	'Hello, world. 5 < 7 and 9 > 3.'
);

ck_assert_unchanged(
	'unterminated tag',
	'<script src="https://mc.yandex.ru/metrika/tag.js"'
);

ck_assert_unchanged(
	'stray closing tags',
	'</script></iframe></div>'
);

ck_assert_unchanged(
	'a bare < that is not a tag',
	'<script<src=x'
);

ck_assert_true(
	'a document with an unclosed <script> still returns a string',
	is_string( consentkit_rewrite_html( '<script src="https://mc.yandex.ru/metrika/tag.js">', CK_SELF, $consentkit_db ) )
);

ck_assert_true(
	'null-ish input is returned as given',
	'' === consentkit_rewrite_html( '', CK_SELF, $consentkit_db )
);

ck_assert_true(
	'an empty database rewrites nothing',
	'<script src="https://mc.yandex.ru/metrika/tag.js"></script>' === consentkit_rewrite_html(
		'<script src="https://mc.yandex.ru/metrika/tag.js"></script>',
		CK_SELF,
		array(
			'hosts' => array(),
			'paths' => array(),
		)
	)
);

/* A realistic page: the rewriter must not disturb anything around the tag. */
$ck_page = "<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"utf-8\">\n" .
	'<script src="' . CK_SELF . "ck-core.js\"></script>\n" .
	"<script src=\"https://mc.yandex.ru/metrika/tag.js\"></script>\n" .
	"<title>Тест — юникод</title>\n</head>\n<body>\n<p>Текст</p>\n" .
	"<script src=\"https://cdn.example.com/theme.js\"></script>\n</body>\n</html>\n";

$ck_page_out = consentkit_rewrite_html( $ck_page, CK_SELF, $consentkit_db );

ck_assert_true(
	'a full page: exactly one tag is rewritten',
	1 === substr_count( $ck_page_out, 'data-ck-src=' ),
	'rewrote ' . substr_count( $ck_page_out, 'data-ck-src=' ) . ' tags'
);

ck_assert_true(
	'a full page: UTF-8 content survives byte-for-byte',
	false !== strpos( $ck_page_out, '<title>Тест — юникод</title>' )
);

ck_assert_true(
	'a full page: the doctype and structure survive',
	0 === strpos( $ck_page_out, "<!doctype html>\n<html lang=\"ru\">" )
);

ck_assert_true(
	'a full page: only the Metrica tag changed',
	str_replace(
		'<script type="text/plain" data-ck="analytics" data-ck-src="https://mc.yandex.ru/metrika/tag.js"></script>',
		'<script src="https://mc.yandex.ru/metrika/tag.js"></script>',
		$ck_page_out
	) === $ck_page
);

/* ---------------------------------------------------------------- summary */

echo "\n";
echo "passed: $consentkit_passed, failed: $consentkit_failed\n";

exit( $consentkit_failed > 0 ? 1 : 0 );
