/* jslint node: true */
'use strict';

var MenuModule			= require('../core/menu_module.js').MenuModule;
//var userDb				= require('../core/database.js').dbs.user;
var getUserList			= require('../core/user.js').getUserList;
var ViewController		= require('../core/view_controller.js').ViewController;
const stringFormat		= require('../core/string_format.js');

var moment				= require('moment');
var async				= require('async');
var _					= require('lodash');

/*
	Available listFormat/focusListFormat object members:
	
	userId			: User ID
	userName		: User name/handle
	lastLoginTs		: Last login timestamp
	status			: Status: active | inactive
	location		: Location
	affiliation		: Affils
	note			: User note
*/

exports.moduleInfo = {
	name		: 'User List',
	desc		: 'Lists all system users',
	author		: 'NuSkooler',
};

exports.getModule	= UserListModule;

var MciCodeIds = {
	UserList	: 1,
};

function UserListModule(options) {
	MenuModule.call(this, options);
}

require('util').inherits(UserListModule, MenuModule);

UserListModule.prototype.mciReady = function(mciData, cb) {
	var self		= this;
	var vc			= self.viewControllers.allViews = new ViewController( { client : self.client } );

	var userList = [];

	var USER_LIST_OPTS = {
		properties : [ 'location', 'affiliation', 'last_login_timestamp' ],
	};

	async.series(
		[
			//	:TODO: These two functions repeated all over -- need DRY
			function callParentMciReady(callback) {
				UserListModule.super_.prototype.mciReady.call(self, mciData, callback);
			},
			function loadFromConfig(callback) {
				var loadOpts = {
					callingMenu		: self,
					mciMap			: mciData.menu,
				};

				vc.loadFromMenuConfig(loadOpts, callback);
			},
			function fetchUserList(callback) {
				//	:TODO: Currently fetching all users - probably always OK, but this could be paged
				getUserList(USER_LIST_OPTS, function got(err, ul) {
					userList = ul;
					callback(err);
				});
			},
			function populateList(callback) {
				var userListView = vc.getView(MciCodeIds.UserList);

				var listFormat 		= self.menuConfig.config.listFormat || '{userName} - {affils}';
				var focusListFormat	= self.menuConfig.config.focusListFormat || listFormat;	//	:TODO: default changed color!
				var dateTimeFormat	= self.menuConfig.config.dateTimeFormat || 'ddd MMM DD';

				function getUserFmtObj(ue) {
					return {
						userId		: ue.userId,
						userName	: ue.userName,
						affils		: ue.affiliation,
						location	: ue.location,
						//	:TODO: the rest!
						note		: ue.note || '',
						lastLoginTs	: moment(ue.last_login_timestamp).format(dateTimeFormat),
					};
				}

				userListView.setItems(_.map(userList, function formatUserEntry(ue) {
					return stringFormat(listFormat, getUserFmtObj(ue));
				}));

				userListView.setFocusItems(_.map(userList, function formatUserEntry(ue) {
					return stringFormat(focusListFormat, getUserFmtObj(ue));
				}));

				userListView.redraw();
				callback(null);
			}
		],		
		function complete(err) {
			if(err) {
				self.client.log.error( { error : err.toString() }, 'Error loading user list');
			}
			cb(err);
		}
	);
};