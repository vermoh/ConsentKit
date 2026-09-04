<?php
/**
 * Uninstall handler — removes every option the plugin created.
 *
 * Runs only when the user deletes the plugin from the Plugins screen, never on
 * deactivation. Consent cookies live in the visitor's browser (ck_consent) and
 * are therefore out of reach here; they expire on their own TTL.
 *
 * @package ConsentKit
 */

// This file must only ever be executed by the WordPress uninstall routine.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// Defence in depth: never executable as a standalone script.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$consentkit_options = array(
	'consentkit_cat_functional',
	'consentkit_cat_analytics',
	'consentkit_cat_marketing',
	'consentkit_language',
	'consentkit_language_custom',
	'consentkit_layout',
	'consentkit_position',
	'consentkit_theme_mode',
	'consentkit_accent',
	'consentkit_policy_version',
	'consentkit_cookie_table',
	'consentkit_server_markup',
	'consentkit_server_markup_skip_admins',
);

foreach ( $consentkit_options as $consentkit_option ) {
	delete_option( $consentkit_option );

	// Multisite: options may also exist per-site network-wide.
	if ( is_multisite() ) {
		delete_site_option( $consentkit_option );
	}
}

unset( $consentkit_options, $consentkit_option );
