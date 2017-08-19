/* jslint node: true */
'use strict';

//	ENiGMA½
const Config				= require('./config.js').config;
const Errors				= require('./enig_error.js').Errors;
const getServer				= require('./listening_server.js').getServer;
const webServerPackageName	= require('./servers/content/web.js').moduleInfo.packageName;
const User					= require('./user.js');
const userDb				= require('./database.js').dbs.user;
const getISOTimestampString	= require('./database.js').getISOTimestampString;
const Log					= require('./logger.js').log;

//	deps
const async					= require('async');
const _						= require('lodash');
const crypto				= require('crypto');
const fs					= require('graceful-fs');
const url					= require('url');
const querystring			= require('querystring');

const PW_RESET_EMAIL_TEXT_TEMPLATE_DEFAULT = 
	`%USERNAME%:
a password reset has been requested for your account on %BOARDNAME%.
    
	* If this was not you, please ignore this email.
	* Otherwise, follow this link: %RESET_URL%
`;

function getWebServer() {
	return getServer(webServerPackageName);
}

class WebPasswordReset {

	static startup(cb) {
		WebPasswordReset.registerRoutes( err => {
			return cb(err);
		});
	}

	static sendForgotPasswordEmail(username, cb) {
		const webServer = getServer(webServerPackageName);
		if(!webServer || !webServer.instance.isEnabled()) {
			return cb(Errors.General('Web server is not enabled'));
		}

		async.waterfall(
			[			
				function getEmailAddress(callback) {
					if(!username) {
						return callback(Errors.MissingParam('Missing "username"'));
					}

					User.getUserIdAndName(username, (err, userId) => {
						if(err) {
							return callback(err);
						}

						User.getUser(userId, (err, user) => {
							if(err || !user.properties.email_address) {
								return callback(Errors.DoesNotExist('No email address associated with this user'));
							}

							return callback(null, user);
						});
					});
				},
				function generateAndStoreResetToken(user, callback) {
					//
					//	Reset "token" is simply HEX encoded cryptographically generated bytes
					//
					crypto.randomBytes(256, (err, token) => {
						if(err) {
							return callback(err);
						}

						token = token.toString('hex');

						const newProperties = {
							email_password_reset_token		: token,
							email_password_reset_token_ts	: getISOTimestampString(),
						};
						
						//	we simply place the reset token in the user's properties
						user.persistProperties(newProperties, err => {
							return callback(err, user);
						});
					});

				},
				function getEmailTemplates(user, callback) {
					fs.readFile(Config.contentServers.web.resetPassword.resetPassEmailText, 'utf8', (err, textTemplate) => {
						if(err) {
							textTemplate = PW_RESET_EMAIL_TEXT_TEMPLATE_DEFAULT;
						}

						fs.readFile(Config.contentServers.web.resetPassword.resetPassEmailHtml, 'utf8', (err, htmlTemplate) => {
							return callback(null, user, textTemplate, htmlTemplate);
						});
					});
				},
				function buildAndSendEmail(user, textTemplate, htmlTemplate, callback) {
					const sendMail = require('./email.js').sendMail;

					const resetUrl = webServer.instance.buildUrl(`/reset_password?token=${user.properties.email_password_reset_token}`);

					function replaceTokens(s) {
						return s
							.replace(/%BOARDNAME%/g,	Config.general.boardName)
							.replace(/%USERNAME%/g, 	user.username)
							.replace(/%TOKEN%/g,		user.properties.email_password_reset_token)
							.replace(/%RESET_URL%/g,	resetUrl)
							;
					}

					textTemplate = replaceTokens(textTemplate);
					if(htmlTemplate) {
						htmlTemplate = replaceTokens(htmlTemplate);
					}					

					const message = {
						to		: `${user.properties.display_name||user.username} <${user.properties.email_address}>`,
						//	from will be filled in
						subject	: 'Forgot Password',
						text	: textTemplate,
						html	: htmlTemplate,
					};

					sendMail(message, (err, info) => {
						//	:TODO: Log me!

						return callback(err);
					});
				}
			],
			err => {
				return cb(err);
			}
		);
	}

	static scheduleEvents(cb) {
		//	:TODO: schedule ~daily cleanup task
		return cb(null);
	}

	static registerRoutes(cb) {
		const webServer = getWebServer();
		if(!webServer) {
			return cb(null);	//	no webserver enabled
		}

		if(!webServer.instance.isEnabled()) {
			return cb(null);	//	no error, but we're not serving web stuff
		}

		[
			{
				//	this is the page displayed to user when they GET it
				method		: 'GET',
				path		: '^\\/reset_password\\?token\\=[a-f0-9]+$',	//	Config.contentServers.web.forgotPasswordPageTemplate
				handler		: WebPasswordReset.routeResetPasswordGet,
			},
				//	POST handler for performing the actual reset
			{
				method		: 'POST',
				path		: '^\\/reset_password$',
				handler		: WebPasswordReset.routeResetPasswordPost,
			}
		].forEach(r => {
			webServer.instance.addRoute(r);
		});

		return cb(null);
	}


	static fileNotFound(webServer, resp) {
		return webServer.instance.fileNotFound(resp);
	}

	static accessDenied(webServer, resp) {
		return webServer.instance.accessDenied(resp);
	}

	static getUserByToken(token, cb) {
		async.waterfall(
			[
				function validateToken(callback) {
					User.getUserIdsWithProperty('email_password_reset_token', token, (err, userIds) => {
						if(userIds && userIds.length === 1) {
							return callback(null, userIds[0]);
						}

						return callback(Errors.Invalid('Invalid password reset token'));
					});
				},
				function getUser(userId, callback) {
					User.getUser(userId, (err, user) => {
						return callback(null, user);
					});
				},
			],
			(err, user) => {
				return cb(err, user);
			}
		);
	}

	static routeResetPasswordGet(req, resp) {
		const webServer = getWebServer();	//	must be valid, we just got a req!

		const urlParts	= url.parse(req.url, true);
		const token		= urlParts.query && urlParts.query.token;

		if(!token) {
			return WebPasswordReset.accessDenied(webServer, resp);
		}

		WebPasswordReset.getUserByToken(token, (err, user) => {
			if(err) {
				//	assume it's expired
				return webServer.instance.respondWithError(resp, 410, 'Invalid or expired reset link.', 'Expired Link');
			}

			const postResetUrl = webServer.instance.buildUrl('/reset_password');

			return webServer.instance.routeTemplateFilePage(
				Config.contentServers.web.resetPassword.resetPageTemplate,
				(templateData, preprocessFinished) => {

					const finalPage = templateData
						.replace(/%BOARDNAME%/g,	Config.general.boardName)
						.replace(/%USERNAME%/g,		user.username)
						.replace(/%TOKEN%/g,		token)
						.replace(/%RESET_URL%/g,	postResetUrl)
						;

					return preprocessFinished(null, finalPage);
				},
				resp
			);
		});
	}

	static routeResetPasswordPost(req, resp) {
		const webServer = getWebServer();	//	must be valid, we just got a req!

		let bodyData = '';
		req.on('data', data => {
			bodyData += data;
		});

		function badRequest() {
			return webServer.instance.respondWithError(resp, 400, 'Bad Request.', 'Bad Request');
		}

		req.on('end', () => {
			const formData = querystring.parse(bodyData);

			if(!formData.token || !formData.password || !formData.confirm_password ||
				formData.password !== formData.confirm_password ||
				formData.password.length < Config.users.passwordMin || formData.password.length > Config.users.passwordMax)
			{
				return badRequest();
			}

			WebPasswordReset.getUserByToken(formData.token, (err, user) => {
				if(err) {
					return badRequest();
				}

				user.setNewAuthCredentials(formData.password, err => {
					if(err) {
						return badRequest();
					}

					//	delete assoc properties - no need to wait for completion
					user.removeProperty('email_password_reset_token');
					user.removeProperty('email_password_reset_token_ts');

					resp.writeHead(200);
					return resp.end('Password changed successfully');
				});
			});
		});
	}
}

function performMaintenanceTask(args, cb) {

	const forgotPassExpireTime = args[0] || '24 hours';

	//	remove all reset token associated properties older than |forgotPassExpireTime|
	userDb.run(
		`DELETE FROM user_property
		WHERE user_id IN (
			SELECT user_id
			FROM user_property
			WHERE prop_name = "email_password_reset_token_ts"
			AND DATETIME("now") >= DATETIME(prop_value, "+${forgotPassExpireTime}")
		) AND prop_name IN ("email_password_reset_token_ts", "email_password_reset_token");`,
		err => {
			if(err) {
				Log.warn( { error : err.message }, 'Failed deleting old email reset tokens');
			}
			return cb(err);
		}
	);
}

exports.WebPasswordReset		= WebPasswordReset;
exports.performMaintenanceTask	= performMaintenanceTask;