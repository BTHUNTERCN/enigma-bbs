/* jslint node: true */
'use strict';

//	ENiGMA½
const MenuModule		= require('../core/menu_module.js').MenuModule;
const ViewController	= require('../core/view_controller.js').ViewController;
const StatLog			= require('../core/stat_log.js');
const getUserName		= require('../core/user.js').getUserName;
const loadProperties	= require('../core/user.js').loadProperties;
const isRootUserId		= require('../core/user.js').isRootUserId;

//	deps
const moment			= require('moment');
const async				= require('async');
const _					= require('lodash');

/*
	Available listFormat object members:
	userId
	userName
	location
	affiliation
	ts
	
*/

exports.moduleInfo = {
	name		: 'Last Callers',
	desc		: 'Last callers to the system',
	author		: 'NuSkooler',
	packageName	: 'codes.l33t.enigma.lastcallers'	//	:TODO: concept idea for mods
};

exports.getModule	= LastCallersModule;

var MciCodeIds = {
	CallerList		: 1,
};

function LastCallersModule(options) {
	MenuModule.call(this, options);
}

require('util').inherits(LastCallersModule, MenuModule);

LastCallersModule.prototype.mciReady = function(mciData, cb) {
	const self		= this;
	const vc		= self.viewControllers.allViews = new ViewController( { client : self.client } );

	let loginHistory;
	let callersView;

	async.series(
		[
			function callParentMciReady(callback) {
				LastCallersModule.super_.prototype.mciReady.call(self, mciData, callback);
			},
			function loadFromConfig(callback) {
				const loadOpts = {
					callingMenu		: self,
					mciMap			: mciData.menu,
					noInput			: true,
				};

				vc.loadFromMenuConfig(loadOpts, callback);
			},
			function fetchHistory(callback) {
				callersView = vc.getView(MciCodeIds.CallerList);

				//	fetch up 
				StatLog.getSystemLogEntries('user_login_history', StatLog.Order.TimestampDesc, 200, (err, lh) => {
					loginHistory = lh;

					if(self.menuConfig.config.hideSysOpLogin) {
						const noOpLoginHistory = loginHistory.filter(lh => {
							return false === isRootUserId(parseInt(lh.log_value));	//	log_value=userId
						});

						//
						//	If we have enough items to display, or hideSysOpLogin is set to 'always',
						//	then set loginHistory to our filtered list. Else, we'll leave it be.
						//
						if(noOpLoginHistory.length >= callersView.dimens.height || 'always' === self.menuConfig.config.hideSysOpLogin) {
							loginHistory = noOpLoginHistory;
						}
					}
					
					//
					//	Finally, we need to trim up the list to the needed size
					//
					loginHistory = loginHistory.slice(0, callersView.dimens.height);
					
					return callback(err);
				});
			},
			function getUserNamesAndProperties(callback) {
				const getPropOpts = {
					names		: [ 'location', 'affiliation' ]
				};

				const dateTimeFormat = self.menuConfig.config.dateTimeFormat || 'ddd MMM DD';

				async.each(
					loginHistory, 
					(item, next) => {
						item.userId = parseInt(item.log_value);
						item.ts		= moment(item.timestamp).format(dateTimeFormat);						

						getUserName(item.userId, (err, userName) => {
							item.userName		= userName;
							getPropOpts.userId	= item.userId;

							loadProperties(getPropOpts, (err, props) => {
								if(!err) {
									item.location 		= props.location;
									item.affiliation	= item.affils = props.affiliation;
								} 
								return next();
							});
						});
					},
					callback
				);
			},
			function populateList(callback) {
				const listFormat = self.menuConfig.config.listFormat || '{userName} - {location} - {affils} - {ts}';

				callersView.setItems(_.map(loginHistory, ce => listFormat.format(ce) ) );

				//	:TODO: This is a hack until pipe codes are better implemented
				callersView.focusItems = callersView.items;

				callersView.redraw();
				return callback(null);
			}
		],
		(err) => {
			if(err) {
				self.client.log.error( { error : err.toString() }, 'Error loading last callers');
			}
			cb(err);
		}
	);
};
