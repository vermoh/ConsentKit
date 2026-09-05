<?php
/**
 * Plugin Name:       ConsentKit
 * Plugin URI:        https://example.com/consentkit
 * Description:       GDPR cookie banner with a parse-time blocking engine, 30+ locales and Google Consent Mode v2. Prototype.
 * Version:           0.5.1
 * Requires PHP:      7.4
 * Requires at least: 6.0
 * Author:            E-COM CONSULT PLUS
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       consentkit
 * Domain Path:       /languages
 *
 * @package ConsentKit
 */

// Block direct file access.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'CONSENTKIT_VERSION', '0.5.1' );
define( 'CONSENTKIT_FILE', __FILE__ );
define( 'CONSENTKIT_PATH', plugin_dir_path( __FILE__ ) );
define( 'CONSENTKIT_URL', plugin_dir_url( __FILE__ ) );

// The server-side rewriting engine. Pure PHP, no WordPress calls, so that
// tests/rewrite.test.php can exercise it under a bare `php` CLI.
require_once CONSENTKIT_PATH . 'includes/rewrite.php';

/**
 * Option name => default value.
 *
 * Every option is registered with its own sanitize_callback (see
 * consentkit_register_settings). Defaults mirror the core config defaults in
 * src/ck-core.js so that a fresh install behaves like the unconfigured library.
 *
 * @return array<string, string>
 */
function consentkit_option_defaults() {
	return array(
		'consentkit_cat_functional' => '1',
		'consentkit_cat_analytics'  => '1',
		'consentkit_cat_marketing'  => '1',
		'consentkit_language'       => 'auto',
		'consentkit_language_custom' => '',
		'consentkit_layout'         => 'bar',
		'consentkit_position'       => 'auto',
		'consentkit_theme_mode'     => 'auto',
		'consentkit_accent'         => '#2B50D8',
		'consentkit_policy_version' => '1',
		'consentkit_cookie_table'   => '',
		'consentkit_server_markup'  => '1',
		'consentkit_server_markup_skip_admins' => '0',
	);
}

/**
 * Read one plugin option with its registered default.
 *
 * @param string $name Option name.
 * @return string
 */
function consentkit_get_option( $name ) {
	$defaults = consentkit_option_defaults();
	$default  = isset( $defaults[ $name ] ) ? $defaults[ $name ] : '';

	return (string) get_option( $name, $default );
}

/**
 * Whitelists for the <select> fields. Anything outside the whitelist is
 * rejected by the sanitizers below and falls back to the first value.
 */

/**
 * Allowed language codes for the language <select>.
 *
 * @return array<int, string>
 */
function consentkit_allowed_languages() {
	return array( 'auto', 'en', 'ru', 'de', 'fr', 'es', 'it', 'pl', 'custom' );
}

/**
 * Allowed layout types.
 *
 * @return array<int, string>
 */
function consentkit_allowed_layouts() {
	return array( 'bar', 'box', 'modal' );
}

/**
 * Allowed banner positions.
 *
 * 'auto' means "do not send a position at all" — the core then applies its own
 * per-type default. The remaining values are type-specific: bottom|top belong to
 * the bar layout, bottom-left|bottom-right to the box layout.
 *
 * @return array<int, string>
 */
function consentkit_allowed_positions() {
	return array( 'auto', 'bottom', 'top', 'bottom-left', 'bottom-right' );
}

/**
 * Positions that are meaningful for a given layout type.
 *
 * modal is centered and has no position, hence the empty list.
 *
 * @param string $layout Layout type.
 * @return array<int, string>
 */
function consentkit_positions_for_layout( $layout ) {
	$map = array(
		'bar'   => array( 'bottom', 'top' ),
		'box'   => array( 'bottom-left', 'bottom-right' ),
		'modal' => array(),
	);

	return isset( $map[ $layout ] ) ? $map[ $layout ] : array();
}

/**
 * Allowed theme modes.
 *
 * @return array<int, string>
 */
function consentkit_allowed_theme_modes() {
	return array( 'auto', 'light', 'dark' );
}

/* -------------------------------------------------------------------------
 * Sanitizers — one per registered option.
 * ---------------------------------------------------------------------- */

/**
 * Normalize a checkbox to '1' or '0'.
 *
 * The admin form prints a hidden input with value="0" before every checkbox,
 * so an unchecked box still POSTs a value. This callback additionally coerces
 * anything that is not exactly '1' to '0', which keeps the stored value binary
 * regardless of how the value reached the option.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function consentkit_sanitize_checkbox( $value ) {
	return ( '1' === (string) $value ) ? '1' : '0';
}

/**
 * Validate the language code against the whitelist.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function consentkit_sanitize_language( $value ) {
	$value = sanitize_text_field( (string) $value );

	return in_array( $value, consentkit_allowed_languages(), true ) ? $value : 'auto';
}

/**
 * Sanitize the free-form BCP-47-ish language code used when language = custom.
 *
 * Only letters and dashes are meaningful here (e.g. "pt-BR", "sr"), so the
 * value is filtered down to that character set and length-capped.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function consentkit_sanitize_language_custom( $value ) {
	$value = sanitize_text_field( (string) $value );
	$value = preg_replace( '/[^A-Za-z\-]/', '', $value );

	return substr( (string) $value, 0, 12 );
}

/**
 * Validate the layout type against the whitelist.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function consentkit_sanitize_layout( $value ) {
	$value = sanitize_text_field( (string) $value );

	return in_array( $value, consentkit_allowed_layouts(), true ) ? $value : 'bar';
}

/**
 * Validate the banner position against the whitelist.
 *
 * Only the whitelist is enforced here; whether the value actually fits the
 * chosen layout is decided at render time in consentkit_build_config(), so an
 * admin can switch the layout back and forth without losing the stored choice.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function consentkit_sanitize_position( $value ) {
	$value = sanitize_text_field( (string) $value );

	return in_array( $value, consentkit_allowed_positions(), true ) ? $value : 'auto';
}

/**
 * Validate the theme mode against the whitelist.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function consentkit_sanitize_theme_mode( $value ) {
	$value = sanitize_text_field( (string) $value );

	return in_array( $value, consentkit_allowed_theme_modes(), true ) ? $value : 'auto';
}

/**
 * Sanitize the accent colour via the core hex-colour sanitizer.
 *
 * sanitize_hex_color() returns null for anything that is not #rgb / #rrggbb,
 * in which case the built-in accent is restored.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function consentkit_sanitize_accent( $value ) {
	$color = sanitize_hex_color( (string) $value );

	return ( null === $color || '' === $color ) ? '#2B50D8' : $color;
}

/**
 * Sanitize the policy version.
 *
 * Kept as an opaque string (the core compares it verbatim), trimmed and
 * length-capped. An empty value falls back to '1' so the comparison in
 * ck-core.js always has something to match.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function consentkit_sanitize_policy_version( $value ) {
	$value = trim( sanitize_text_field( (string) $value ) );

	return ( '' === $value ) ? '1' : substr( $value, 0, 64 );
}

/**
 * Validate the cookie table JSON.
 *
 * Rules:
 *  - an empty textarea is valid and means "no cookie table";
 *  - the value must decode to a JSON *array* (the UI iterates over it);
 *  - on any failure an admin error notice is registered and the previously
 *    stored value is returned unchanged, so invalid JSON is never persisted.
 *
 * @param mixed $value Raw value.
 * @return string
 */
function consentkit_sanitize_cookie_table( $value ) {
	// No wp_unslash() here: options.php already unslashes the POSTed value
	// before invoking the sanitize_callback. Unslashing a second time would
	// strip the backslashes that are meaningful inside JSON (\" \\ \/) and
	// turn valid admin input into a parse error.
	$raw      = is_string( $value ) ? trim( $value ) : '';
	$previous = (string) get_option( 'consentkit_cookie_table', '' );

	if ( '' === $raw ) {
		return '';
	}

	$decoded = json_decode( $raw, true );

	if ( null === $decoded && JSON_ERROR_NONE !== json_last_error() ) {
		add_settings_error(
			'consentkit_cookie_table',
			'consentkit_cookie_table_invalid',
			sprintf(
				/* translators: %s: JSON parser error message. */
				esc_html__( 'Cookie table: invalid JSON (%s). Previous value kept.', 'consentkit' ),
				esc_html( json_last_error_msg() )
			),
			'error'
		);

		return $previous;
	}

	if ( ! is_array( $decoded ) ) {
		add_settings_error(
			'consentkit_cookie_table',
			'consentkit_cookie_table_not_array',
			esc_html__( 'Cookie table: expected a JSON array of cookie descriptions. Previous value kept.', 'consentkit' ),
			'error'
		);

		return $previous;
	}

	// Re-encode from the decoded structure: this normalizes formatting and
	// guarantees the stored string is exactly what json_decode accepted.
	$normalized = wp_json_encode( $decoded );

	return ( false === $normalized ) ? $previous : $normalized;
}

/* -------------------------------------------------------------------------
 * Settings registration + admin page.
 * ---------------------------------------------------------------------- */

/**
 * Register every option with the Settings API.
 *
 * All options live in the 'consentkit_settings' group; settings_fields() prints
 * the nonce and the option_page marker for that group on the form.
 *
 * @return void
 */
function consentkit_register_settings() {
	$options = array(
		'consentkit_cat_functional'  => 'consentkit_sanitize_checkbox',
		'consentkit_cat_analytics'   => 'consentkit_sanitize_checkbox',
		'consentkit_cat_marketing'   => 'consentkit_sanitize_checkbox',
		'consentkit_language'        => 'consentkit_sanitize_language',
		'consentkit_language_custom' => 'consentkit_sanitize_language_custom',
		'consentkit_layout'          => 'consentkit_sanitize_layout',
		'consentkit_position'        => 'consentkit_sanitize_position',
		'consentkit_theme_mode'      => 'consentkit_sanitize_theme_mode',
		'consentkit_accent'          => 'consentkit_sanitize_accent',
		'consentkit_policy_version'  => 'consentkit_sanitize_policy_version',
		'consentkit_cookie_table'    => 'consentkit_sanitize_cookie_table',
		'consentkit_server_markup'   => 'consentkit_sanitize_checkbox',
		'consentkit_server_markup_skip_admins' => 'consentkit_sanitize_checkbox',
	);

	$defaults = consentkit_option_defaults();

	foreach ( $options as $name => $callback ) {
		register_setting(
			'consentkit_settings',
			$name,
			array(
				'type'              => 'string',
				'sanitize_callback' => $callback,
				'default'           => isset( $defaults[ $name ] ) ? $defaults[ $name ] : '',
			)
		);
	}

	add_settings_section(
		'consentkit_section_main',
		esc_html__( 'Banner configuration', 'consentkit' ),
		'consentkit_render_section_intro',
		'consentkit'
	);
}
add_action( 'admin_init', 'consentkit_register_settings' );

/**
 * Intro paragraph for the settings section.
 *
 * @return void
 */
function consentkit_render_section_intro() {
	echo '<p>' . esc_html__( 'These settings are serialized into ConsentKit.init() on every front-end page.', 'consentkit' ) . '</p>';
}

/**
 * Add the Settings -> ConsentKit submenu page.
 *
 * @return void
 */
function consentkit_add_admin_menu() {
	add_options_page(
		esc_html__( 'ConsentKit', 'consentkit' ),
		esc_html__( 'ConsentKit', 'consentkit' ),
		'manage_options',
		'consentkit',
		'consentkit_render_admin_page'
	);
}
add_action( 'admin_menu', 'consentkit_add_admin_menu' );

/**
 * Render one checkbox row with the hidden "0" companion input.
 *
 * @param string $name  Option name.
 * @param string $label Field label.
 * @return void
 */
function consentkit_render_checkbox( $name, $label ) {
	$value = consentkit_get_option( $name );
	?>
	<label for="<?php echo esc_attr( $name ); ?>">
		<input type="hidden" name="<?php echo esc_attr( $name ); ?>" value="0" />
		<input
			type="checkbox"
			id="<?php echo esc_attr( $name ); ?>"
			name="<?php echo esc_attr( $name ); ?>"
			value="1"
			<?php checked( '1', $value ); ?>
		/>
		<?php echo esc_html( $label ); ?>
	</label><br />
	<?php
}

/**
 * Render one <select> from a whitelist.
 *
 * @param string                $name    Option name.
 * @param array<string, string> $choices value => visible label.
 * @return void
 */
function consentkit_render_select( $name, $choices ) {
	$value = consentkit_get_option( $name );
	?>
	<select id="<?php echo esc_attr( $name ); ?>" name="<?php echo esc_attr( $name ); ?>">
		<?php foreach ( $choices as $key => $label ) : ?>
			<option value="<?php echo esc_attr( $key ); ?>" <?php selected( $key, $value ); ?>>
				<?php echo esc_html( $label ); ?>
			</option>
		<?php endforeach; ?>
	</select>
	<?php
}

/**
 * Render the Settings -> ConsentKit page.
 *
 * @return void
 */
function consentkit_render_admin_page() {
	// Defence in depth: add_options_page already restricts the menu entry.
	if ( ! current_user_can( 'manage_options' ) ) {
		wp_die( esc_html__( 'You do not have permission to access this page.', 'consentkit' ) );
	}
	?>
	<div class="wrap">
		<h1><?php echo esc_html__( 'ConsentKit', 'consentkit' ); ?></h1>

		<?php settings_errors(); ?>

		<form action="options.php" method="post">
			<?php
			// Prints the nonce (_wpnonce), option_page and _wp_http_referer.
			settings_fields( 'consentkit_settings' );
			do_settings_sections( 'consentkit' );
			?>

			<table class="form-table" role="presentation">
				<tbody>
					<tr>
						<th scope="row"><?php echo esc_html__( 'Categories', 'consentkit' ); ?></th>
						<td>
							<?php
							consentkit_render_checkbox( 'consentkit_cat_functional', __( 'Functional', 'consentkit' ) );
							consentkit_render_checkbox( 'consentkit_cat_analytics', __( 'Analytics', 'consentkit' ) );
							consentkit_render_checkbox( 'consentkit_cat_marketing', __( 'Marketing', 'consentkit' ) );
							?>
							<p class="description">
								<?php echo esc_html__( 'The "necessary" category is always active and cannot be disabled. Disabled categories are never granted, even if a stored consent contains them.', 'consentkit' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row">
							<label for="consentkit_language"><?php echo esc_html__( 'Language', 'consentkit' ); ?></label>
						</th>
						<td>
							<?php
							consentkit_render_select(
								'consentkit_language',
								array(
									'auto'   => __( 'Auto (browser language)', 'consentkit' ),
									'en'     => __( 'English', 'consentkit' ),
									'ru'     => __( 'Russian', 'consentkit' ),
									'de'     => __( 'German', 'consentkit' ),
									'fr'     => __( 'French', 'consentkit' ),
									'es'     => __( 'Spanish', 'consentkit' ),
									'it'     => __( 'Italian', 'consentkit' ),
									'pl'     => __( 'Polish', 'consentkit' ),
									'custom' => __( 'Custom code…', 'consentkit' ),
								)
							);
							?>
							<p>
								<label for="consentkit_language_custom">
									<?php echo esc_html__( 'Custom language code', 'consentkit' ); ?>
								</label>
								<input
									type="text"
									id="consentkit_language_custom"
									name="consentkit_language_custom"
									value="<?php echo esc_attr( consentkit_get_option( 'consentkit_language_custom' ) ); ?>"
									class="regular-text"
									placeholder="pt-BR"
								/>
							</p>
							<p class="description">
								<?php echo esc_html__( 'Used only when "Custom code…" is selected. ConsentKit ships 30+ locales; an unknown code falls back to English.', 'consentkit' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row">
							<label for="consentkit_layout"><?php echo esc_html__( 'Layout', 'consentkit' ); ?></label>
						</th>
						<td>
							<?php
							consentkit_render_select(
								'consentkit_layout',
								array(
									'bar'   => __( 'Bar (full width)', 'consentkit' ),
									'box'   => __( 'Box (compact card)', 'consentkit' ),
									'modal' => __( 'Modal (centered)', 'consentkit' ),
								)
							);
							?>
						</td>
					</tr>

					<tr>
						<th scope="row">
							<label for="consentkit_position"><?php echo esc_html__( 'Banner position', 'consentkit' ); ?></label>
						</th>
						<td>
							<?php
							consentkit_render_select(
								'consentkit_position',
								array(
									'auto'         => __( 'Automatic (based on layout)', 'consentkit' ),
									'bottom'       => __( 'Bottom', 'consentkit' ),
									'top'          => __( 'Top', 'consentkit' ),
									'bottom-left'  => __( 'Bottom left', 'consentkit' ),
									'bottom-right' => __( 'Bottom right', 'consentkit' ),
								)
							);
							?>
							<p class="description">
								<?php echo esc_html__( 'Bottom and Top apply to the bar layout; Bottom left and Bottom right apply to the box layout. The centered modal ignores the position entirely.', 'consentkit' ); ?>
							</p>
							<p class="description">
								<?php echo esc_html__( '"Automatic" picks a sensible position for the chosen layout: bottom for the bar, bottom left for the box. A position that does not match the layout is ignored the same way.', 'consentkit' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row">
							<label for="consentkit_theme_mode"><?php echo esc_html__( 'Theme mode', 'consentkit' ); ?></label>
						</th>
						<td>
							<?php
							consentkit_render_select(
								'consentkit_theme_mode',
								array(
									'auto'  => __( 'Auto (follow system)', 'consentkit' ),
									'light' => __( 'Light', 'consentkit' ),
									'dark'  => __( 'Dark', 'consentkit' ),
								)
							);
							?>
						</td>
					</tr>

					<tr>
						<th scope="row">
							<label for="consentkit_accent"><?php echo esc_html__( 'Accent color', 'consentkit' ); ?></label>
						</th>
						<td>
							<input
								type="color"
								id="consentkit_accent"
								name="consentkit_accent"
								value="<?php echo esc_attr( consentkit_get_option( 'consentkit_accent' ) ); ?>"
							/>
							<p class="description">
								<?php echo esc_html__( 'Applies to the light theme. The dark theme uses its own accessible accent.', 'consentkit' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row">
							<label for="consentkit_policy_version"><?php echo esc_html__( 'Policy version', 'consentkit' ); ?></label>
						</th>
						<td>
							<input
								type="text"
								id="consentkit_policy_version"
								name="consentkit_policy_version"
								value="<?php echo esc_attr( consentkit_get_option( 'consentkit_policy_version' ) ); ?>"
								class="regular-text"
							/>
							<p class="description">
								<?php echo esc_html__( 'Raise this value when the privacy policy changes — consent will be requested again.', 'consentkit' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row"><?php echo esc_html__( 'Серверная разметка трекеров', 'consentkit' ); ?></th>
						<td>
							<?php
							consentkit_render_checkbox(
								'consentkit_server_markup',
								__( 'Размечать теги известных трекеров прямо в HTML страницы', 'consentkit' )
							);
							?>
							<p class="description">
								<?php echo esc_html__( 'Плагин просматривает готовый HTML страницы перед отправкой браузеру и переписывает теги известных трекеров (Яндекс.Метрика, gtag.js, пиксели Meta и TikTok, чаты и другие — всего около 70 хостов) в безопасный вид: type="text/plain" с адресом в data-ck-src. Скрипт не выполняется, пока посетитель не разрешит соответствующую категорию.', 'consentkit' ); ?>
							</p>
							<p class="description">
								<?php echo esc_html__( 'Честно о том, что это добавляет: скрипты, которые вставляет другой код на странице, движок блокировки перехватывал и раньше — с этим он справлялся всегда. Не поддавались только теги, написанные прямо в HTML: браузер начинает их скачивать ещё до того, как выполнится первая строка ConsentKit, и закрыть этот разрыв со стороны браузера невозможно. Сервер работает раньше разбора страницы по определению — поэтому такие теги закрывает только эта настройка.', 'consentkit' ); ?>
							</p>
							<p class="description">
								<?php echo esc_html__( 'Кэширующие плагины: совместимо. В кэш попадает уже размеченный HTML, потому что разметка выполняется на уровне PHP, до сохранения страницы в кэш.', 'consentkit' ); ?>
							</p>
							<p class="description">
								<?php echo esc_html__( 'Отдельный тег можно исключить из разметки — добавьте ему атрибут data-ck-ignore. Теги, размеченные вручную (type="text/plain" с data-ck), не трогаются. Контейнер GTM (gtm.js) намеренно не блокируется: теги внутри него подчиняются Consent Mode, а блокировка контейнера ломает эту модель.', 'consentkit' ); ?>
							</p>
							<?php
							consentkit_render_checkbox(
								'consentkit_server_markup_skip_admins',
								__( 'Не размечать страницы для вошедших редакторов и администраторов', 'consentkit' )
							);
							?>
							<p class="description">
								<?php echo esc_html__( 'Включите, если разметка мешает редактору или конструктору страниц. На страницы обычных посетителей это не влияет.', 'consentkit' ); ?>
							</p>
						</td>
					</tr>

					<tr>
						<th scope="row">
							<label for="consentkit_cookie_table"><?php echo esc_html__( 'Cookie table (JSON)', 'consentkit' ); ?></label>
						</th>
						<td>
							<textarea
								id="consentkit_cookie_table"
								name="consentkit_cookie_table"
								rows="10"
								class="large-text code"
								spellcheck="false"
							><?php echo esc_textarea( consentkit_get_option( 'consentkit_cookie_table' ) ); ?></textarea>
							<p class="description">
								<?php echo esc_html__( 'A JSON array shown in the preferences panel. Invalid JSON is not saved and the previous value is kept.', 'consentkit' ); ?>
							</p>
							<p class="description">
								<code>
								<?php
								echo esc_html( '[{"name":"_ga","category":"analytics","vendor":"Google","purpose":"Visitor statistics","expiry":"2 years"}]' );
								?>
								</code>
							</p>
						</td>
					</tr>
				</tbody>
			</table>

			<?php submit_button(); ?>
		</form>
	</div>
	<?php
}

/* -------------------------------------------------------------------------
 * Front-end output.
 * ---------------------------------------------------------------------- */

/**
 * Build the config array handed to ConsentKit.init().
 *
 * The shape must match src/ck-core.js exactly:
 *  - categories values are OBJECTS ({"enabled":bool}), not booleans — core
 *    reads cfg.enabled !== false, so a bare `false` would read as enabled;
 *  - layout carries `type` and, only when it is meaningful, `position`. The
 *    accepted positions are type-specific: bar takes bottom|top, box takes
 *    bottom-left|bottom-right and the centered modal takes none. A position
 *    belonging to a different type carries no information for the chosen one,
 *    so it is dropped here rather than forwarded — the core then applies its
 *    own per-type default, which is also what 'auto' selects;
 *  - theme mode nests inside `theme`, next to `accent`;
 *  - policyVersion stays a string, compared verbatim by the core;
 *  - cookieTable is decoded to a real array — the UI iterates it.
 *
 * @return array<string, mixed>
 */
function consentkit_build_config() {
	$language = consentkit_get_option( 'consentkit_language' );

	if ( 'custom' === $language ) {
		$custom   = consentkit_get_option( 'consentkit_language_custom' );
		$language = ( '' === $custom ) ? 'auto' : $custom;
	}

	$cookie_table = array();
	$raw_table    = consentkit_get_option( 'consentkit_cookie_table' );

	if ( '' !== $raw_table ) {
		$decoded = json_decode( $raw_table, true );
		if ( is_array( $decoded ) ) {
			$cookie_table = $decoded;
		}
	}

	$layout_type = consentkit_get_option( 'consentkit_layout' );
	$layout      = array( 'type' => $layout_type );
	$position    = consentkit_get_option( 'consentkit_position' );

	// 'auto' and any position that belongs to a different layout type are both
	// expressed by sending no position at all.
	if ( 'auto' !== $position && in_array( $position, consentkit_positions_for_layout( $layout_type ), true ) ) {
		$layout['position'] = $position;
	}

	return array(
		'policyVersion' => consentkit_get_option( 'consentkit_policy_version' ),
		'language'      => $language,
		'layout'        => $layout,
		'theme'         => array(
			'accent' => consentkit_get_option( 'consentkit_accent' ),
			'mode'   => consentkit_get_option( 'consentkit_theme_mode' ),
		),
		'categories'    => array(
			'functional' => array( 'enabled' => ( '1' === consentkit_get_option( 'consentkit_cat_functional' ) ) ),
			'analytics'  => array( 'enabled' => ( '1' === consentkit_get_option( 'consentkit_cat_analytics' ) ) ),
			'marketing'  => array( 'enabled' => ( '1' === consentkit_get_option( 'consentkit_cat_marketing' ) ) ),
		),
		'cookieTable'   => $cookie_table,
	);
}

/**
 * Decide whether the banner should be printed for the current request.
 *
 * Excluded: admin screens, feeds, REST requests, embeds, XML-RPC, favicon and
 * any AJAX/cron entry point. Front-end HTML only.
 *
 * @return bool
 */
function consentkit_should_output() {
	if ( is_admin() || is_feed() || is_embed() ) {
		return false;
	}

	if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
		return false;
	}

	if ( defined( 'DOING_AJAX' ) && DOING_AJAX ) {
		return false;
	}

	if ( defined( 'DOING_CRON' ) && DOING_CRON ) {
		return false;
	}

	if ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) {
		return false;
	}

	if ( function_exists( 'is_favicon' ) && is_favicon() ) {
		return false;
	}

	/**
	 * Filter whether ConsentKit prints its scripts on this request.
	 *
	 * @param bool $should_output Current decision.
	 */
	return (bool) apply_filters( 'consentkit_should_output', true );
}

/**
 * Build a cache-busted asset URL, versioned by file mtime.
 *
 * filemtime() warns on a missing file, so existence is checked first and the
 * plugin version is used as the fallback query string.
 *
 * @param string $filename File name inside assets/.
 * @return string
 */
function consentkit_asset_url( $filename ) {
	$path    = CONSENTKIT_PATH . 'assets/' . $filename;
	$version = CONSENTKIT_VERSION;

	if ( file_exists( $path ) ) {
		$mtime = filemtime( $path );
		if ( false !== $mtime ) {
			$version = (string) $mtime;
		}
	}

	return add_query_arg( 'ver', rawurlencode( $version ), CONSENTKIT_URL . 'assets/' . $filename );
}

/**
 * Print the ConsentKit script tags as early as possible in <head>.
 *
 * WHY wp_head AT PRIORITY 0 AND NOT wp_enqueue_script:
 *
 * ck-core.js is not an ordinary library — at parse time, before init() is ever
 * called, it patches document.createElement, Element.prototype.setAttribute and
 * the HTMLScriptElement.prototype.src setter to intercept tracker scripts. That
 * interception only covers scripts created AFTER the patch is installed, so any
 * third-party script that runs before ck-core.js injects its trackers outside
 * the blocking engine entirely — a GDPR defect, not a cosmetic ordering issue.
 *
 * wp_enqueue_script cannot guarantee that position: enqueued head scripts are
 * printed by wp_print_head_scripts, which core hooks to wp_head at priority 9.
 * Priorities 1-8 remain available to themes and other plugins, and many analytics
 * plugins deliberately print inline snippets there. Registering a dependency
 * chain does not help either, because it only orders scripts within the enqueue
 * system and says nothing about raw tags printed by other wp_head callbacks.
 *
 * wp_head priority 0 runs before every conventional callback and before the
 * enqueue system, which is the earliest hook available inside <head> in a
 * theme-independent way. (Only a theme that omits wp_head() entirely could
 * defeat this, and such a theme breaks WordPress itself.)
 *
 * The tags are printed in contract order core -> locales -> ui -> debug with no
 * async/defer: document-order, blocking execution is exactly what guarantees
 * both the ordering and the parse-time activation of the blocking engine.
 * ck-debug-loader.js is last and inert: about 1.5 KB that does nothing at all
 * unless the page is opened with ?ck_debug=1. Only then does it fetch the
 * ~30 KB panel (src/ck-debug.js) from the CDN, pinned to the running core
 * version — so an ordinary visitor never downloads the panel.
 *
 * @return void
 */
function consentkit_print_scripts() {
	if ( ! consentkit_should_output() ) {
		return;
	}

	$files = array( 'ck-core.js', 'ck-locales.js', 'ck-ui-branding.js', 'ck-ui.js', 'ck-debug-loader.js' );

	foreach ( $files as $file ) {
		printf(
			'<script src="%s"></script>' . "\n",
			esc_url( consentkit_asset_url( $file ) )
		);
	}

	$config = consentkit_build_config();

	/**
	 * Filter the config passed to ConsentKit.init().
	 *
	 * @param array $config Config array.
	 */
	$config = apply_filters( 'consentkit_config', $config );

	// JSON_HEX_TAG is essential: cookieTable is admin-supplied free text and an
	// embedded "</script>" would otherwise terminate the inline block early.
	// JSON_HEX_AMP/APOS/QUOT keep the payload inert in any HTML context.
	$json = wp_json_encode( $config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE );

	if ( false === $json ) {
		return;
	}

	echo '<script>window.ConsentKit&&window.ConsentKit.init(' . $json . ');</script>' . "\n";
}
add_action( 'wp_head', 'consentkit_print_scripts', 0 );

/* -------------------------------------------------------------------------
 * Server-side tracker markup (debt Д10).
 *
 * The blocking engine in ck-core.js intercepts every tracker INJECTED by other
 * JavaScript, but it cannot catch a tag written straight into the page: the
 * HTML parser issues that request before our first line runs, and the gap is
 * not closable from the browser. The server runs before the parser by
 * definition, so the page is rewritten here — turning a static tracker tag into
 * exactly the manual markup the README documents, which the shipped client
 * already knows how to restore after consent.
 *
 * Cache plugins: compatible, and in the right order. The buffer is a PHP-level
 * filter on the generated page, so a caching plugin stores the ALREADY
 * rewritten HTML and every cache hit is served blocked.
 * ---------------------------------------------------------------------- */

/**
 * Whether the server-side markup should run for this request.
 *
 * @return bool
 */
function consentkit_server_markup_enabled() {
	if ( '1' !== consentkit_get_option( 'consentkit_server_markup' ) ) {
		return false;
	}

	// Same front-end gate as the banner: no admin, feeds, REST, AJAX, cron,
	// XML-RPC, embeds or favicon.
	if ( ! consentkit_should_output() ) {
		return false;
	}

	// Optional escape hatch for page builders, which often preview the page
	// through the front end while logged in.
	if ( '1' === consentkit_get_option( 'consentkit_server_markup_skip_admins' )
		&& function_exists( 'current_user_can' ) && current_user_can( 'edit_posts' ) ) {
		return false;
	}

	/**
	 * Filter whether ConsentKit rewrites tracker tags on this request.
	 *
	 * @param bool $enabled Current decision.
	 */
	return (bool) apply_filters( 'consentkit_server_markup', true );
}

/**
 * Output-buffer callback: rewrite tracker tags in the finished page.
 *
 * Everything here is defensive. This callback stands between WordPress and the
 * visitor's browser, so any failure must degrade to "return the page exactly as
 * it was" — an unblocked tracker is a compliance problem, a broken page is an
 * outage.
 *
 * The content type is checked HERE and not at template_redirect: headers are
 * not final until the page has actually been generated, so a request that turns
 * out to emit XML or JSON (wp-sitemap.xml is the common one — is_feed() does not
 * cover it) is only recognisable at this point.
 *
 * @param string $buffer Complete page output.
 * @return string
 */
function consentkit_filter_output( $buffer ) {
	try {
		if ( ! is_string( $buffer ) || '' === $buffer ) {
			return $buffer;
		}

		// Not HTML: leave XML, JSON, plain text and binary responses alone.
		if ( function_exists( 'headers_list' ) ) {
			foreach ( headers_list() as $header ) {
				if ( 0 === stripos( $header, 'content-type:' ) ) {
					$value = strtolower( trim( substr( $header, strlen( 'content-type:' ) ) ) );
					if ( '' !== $value && false === strpos( $value, 'text/html' ) && false === strpos( $value, 'application/xhtml' ) ) {
						return $buffer;
					}
				}
			}
		}

		// Sniff the payload too: a fragment that is not a document (some
		// endpoints emit bare JSON with no Content-Type) must pass through.
		$head = ltrim( substr( $buffer, 0, 512 ) );
		if ( '' !== $head && ( '{' === $head[0] || '[' === $head[0] ) ) {
			return $buffer;
		}
		if ( false === stripos( $head, '<!doctype html' ) && false === stripos( $head, '<html' ) ) {
			return $buffer;
		}

		$rewritten = consentkit_rewrite_html( $buffer, CONSENTKIT_URL );

		return ( is_string( $rewritten ) && '' !== $rewritten ) ? $rewritten : $buffer;
	} catch ( Exception $e ) {
		return $buffer;
	} catch ( Throwable $e ) {
		// PHP 7+: an Error (not an Exception) must not take the page down.
		return $buffer;
	}
}

/**
 * Start the output buffer.
 *
 * template_redirect is the last hook before the theme starts producing output,
 * which makes it the earliest point at which the request is known to be a
 * front-end page render.
 *
 * @return void
 */
function consentkit_start_output_buffer() {
	if ( ! consentkit_server_markup_enabled() ) {
		return;
	}

	ob_start( 'consentkit_filter_output' );
}
add_action( 'template_redirect', 'consentkit_start_output_buffer' );

/* -------------------------------------------------------------------------
 * Shortcode.
 * ---------------------------------------------------------------------- */

/**
 * [consentkit_settings text="..."] — a link reopening the preferences panel.
 *
 * @param array<string, mixed>|string $atts Shortcode attributes.
 * @return string
 */
function consentkit_shortcode_settings( $atts ) {
	$atts = shortcode_atts(
		array(
			'text' => __( 'Настройки cookie', 'consentkit' ),
		),
		$atts,
		'consentkit_settings'
	);

	return sprintf(
		'<a href="#" class="consentkit-settings-link" onclick="ConsentKit.show();return false">%s</a>',
		esc_html( $atts['text'] )
	);
}
add_shortcode( 'consentkit_settings', 'consentkit_shortcode_settings' );

/* -------------------------------------------------------------------------
 * Misc.
 * ---------------------------------------------------------------------- */

/**
 * Add a Settings shortcut to the plugin row on the Plugins screen.
 *
 * @param array<int, string> $links Existing action links.
 * @return array<int, string>
 */
function consentkit_plugin_action_links( $links ) {
	$url = admin_url( 'options-general.php?page=consentkit' );

	array_unshift(
		$links,
		sprintf( '<a href="%s">%s</a>', esc_url( $url ), esc_html__( 'Settings', 'consentkit' ) )
	);

	return $links;
}
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), 'consentkit_plugin_action_links' );
