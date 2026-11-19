<?php
# Configuracion de MantisBT para Rayuela (CARD-19 / MAN-01).
# Los valores sensibles llegan como Docker Secrets (archivos en /run/secrets, indicados con
# <NOMBRE>_FILE) o, como alternativa, por variable de entorno: este archivo no contiene secretos.

if( !function_exists( 'rayuela_secreto' ) ) {
	function rayuela_secreto( $p_nombre ) {
		$t_archivo = getenv( $p_nombre . '_FILE' );
		if( $t_archivo && is_readable( $t_archivo ) ) {
			$t_valor = trim( file_get_contents( $t_archivo ) );
			if( $t_valor !== '' ) {
				return $t_valor;
			}
		}
		return getenv( $p_nombre );
	}
}

$g_db_type            = 'mysqli';
$g_hostname           = getenv( 'MANTIS_DB_HOST' ) ?: 'mantis-db';
$g_database_name      = getenv( 'MANTIS_DB_NAME' ) ?: 'bugtracker';
$g_db_username        = getenv( 'MANTIS_DB_USER' ) ?: 'mantis';
$g_db_password        = rayuela_secreto( 'MANTIS_DB_PASSWORD' );
$g_crypto_master_salt = rayuela_secreto( 'MANTIS_CRYPTO_SALT' );

# URL base fija: evita que Mantis la deduzca de las cabeceras HTTP (riesgo de inyeccion de cabeceras Host).
# Debe terminar en barra. Se define con MANTIS_BASE_URL (no MANTIS_URL: la imagen xlrl ya usa ese nombre
# para la direccion de descarga de Mantis); por defecto, el acceso local del compose.
$g_path            = getenv( 'MANTIS_BASE_URL' ) ?: 'http://localhost:8081/';

$g_window_title    = 'Rayuela - Incidencias';
$g_default_language = 'spanish';
$g_default_timezone = 'America/Argentina/Jujuy';

# Sin servidor SMTP configurado: se desactivan los correos y el alta publica de usuarios.
$g_enable_email_notification = OFF;
$g_allow_signup              = OFF;
$g_allow_anonymous_login     = OFF;
