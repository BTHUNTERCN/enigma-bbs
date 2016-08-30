/* jslint node: true */
'use strict';

var userDb			= require('./database.js').dbs.user;
var Config			= require('./config.js').config;
var userGroup		= require('./user_group.js');

var crypto			= require('crypto');
var assert			= require('assert');
var async			= require('async');
var _				= require('lodash');
var moment			= require('moment');

exports.User						= User;
exports.getUserIdAndName			= getUserIdAndName;
exports.getUserName					= getUserName;
exports.loadProperties				= loadProperties;
exports.getUserIdsWithProperty		= getUserIdsWithProperty;
exports.getUserList					= getUserList;

exports.isRootUserId = function(id) { return 1 === id; };

function User() {
	var self = this;

	this.userId		= 0;
	this.username	= '';
	this.properties	= {};	//	name:value
	this.groups		= [];	//	group membership(s)

	this.isAuthenticated = function() {
		return true === self.authenticated;
	};

	this.isValid = function() {
		if(self.userId <= 0 || self.username.length < Config.users.usernameMin) {
			return false;
		}

		return this.hasValidPassword();
	};

	this.hasValidPassword = function() {
		if(!this.properties || !this.properties.pw_pbkdf2_salt || !this.properties.pw_pbkdf2_dk) {
			return false;
		}

		return this.properties.pw_pbkdf2_salt.length === User.PBKDF2.saltLen * 2 &&
			this.prop_name.pw_pbkdf2_dk.length === User.PBKDF2.keyLen * 2;
	};

	this.isRoot = function() {
		return 1 === this.userId;
	};

	this.isSysOp = this.isRoot;	//	alias

	this.isGroupMember = function(groupNames) {
		if(_.isString(groupNames)) {
			groupNames = [ groupNames ];
		}

		//	:TODO: _.some()

		var isMember = false;
		
		_.forEach(groupNames, groupName => {
			if(-1 !== self.groups.indexOf(groupName)) {
				isMember = true;
				return false;    //  stop iteration
			} 
		});

		return isMember;
	};

	this.getLegacySecurityLevel = function() {
		if(self.isRoot() || self.isGroupMember('sysops')) {
			return 100;
		} else if(self.isGroupMember('users')) {
			return 30;
		} else {
			return 10;	//	:TODO: Is this what we want?	
		}
	};

}

User.PBKDF2 = {
	iterations	: 1000,
	keyLen		: 128,
	saltLen		: 32,
};

User.StandardPropertyGroups = {
	password	: [ 'pw_pbkdf2_salt', 'pw_pbkdf2_dk' ],
};

User.AccountStatus = {
	disabled	: 0,
	inactive	: 1,
	active		: 2,
};

User.prototype.load = function(userId, cb) {

};

User.prototype.authenticate = function(username, password, cb) {
	const self = this;

	const cachedInfo = {};

	async.waterfall(
		[
			function fetchUserId(callback) {
				//	get user ID
				getUserIdAndName(username, function onUserId(err, uid, un) {
					cachedInfo.userId	= uid;
					cachedInfo.username	= un;

					callback(err);
				});
			},

			function getRequiredAuthProperties(callback) {
				//	fetch properties required for authentication
				loadProperties( { userId : cachedInfo.userId, names : User.StandardPropertyGroups.password }, function onProps(err, props) {
					callback(err, props);
				});
			},
			function getDkWithSalt(props, callback) {
				//	get DK from stored salt and password provided
				generatePasswordDerivedKey(password, props.pw_pbkdf2_salt, function onDk(err, dk) {
					callback(err, dk, props.pw_pbkdf2_dk);
				});
			},
			function validateAuth(passDk, propsDk, callback) {
				//
				//	Use constant time comparison here for security feel-goods
				//
				var passDkBuf	= new Buffer(passDk,	'hex');
				var propsDkBuf	= new Buffer(propsDk,	'hex');

				if(passDkBuf.length !== propsDkBuf.length) {
					callback(new Error('Invalid password'));
					return;
				}

				var c = 0;
				for(var i = 0; i < passDkBuf.length; i++) {
					c |= passDkBuf[i] ^ propsDkBuf[i];
				}

				callback(0 === c ? null : new Error('Invalid password'));
			},
			function initProps(callback) {
				loadProperties( { userId : cachedInfo.userId }, function onProps(err, allProps) {
					if(!err) {
						cachedInfo.properties = allProps;
					}

					callback(err);
				});
			},
			function initGroups(callback) {
				userGroup.getGroupsForUser(cachedInfo.userId, function groupsLoaded(err, groups) {
					if(!err) {
						cachedInfo.groups = groups;
					}

					callback(err);
				});
			}
		],
		function complete(err) {
			if(!err) {
				self.userId			= cachedInfo.userId;
				self.username		= cachedInfo.username;
				self.properties		= cachedInfo.properties;
				self.groups			= cachedInfo.groups;
				self.authenticated	= true;
			}

			return cb(err);
		}
	);
};

User.prototype.create = function(options, cb) {
	assert(0 === this.userId);
	assert(this.username.length > 0);	//	:TODO: Min username length? Max?
	assert(_.isObject(options));
	assert(_.isString(options.password));

	var self = this;

	//	:TODO: set various defaults, e.g. default activation status, etc.
	self.properties.account_status = Config.users.requireActivation ? User.AccountStatus.inactive : User.AccountStatus.active;

	async.series(
		[
			function beginTransaction(callback) {
				userDb.run('BEGIN;', function transBegin(err) {
					callback(err);
				});
			},
			function createUserRec(callback) {
				userDb.run(
					'INSERT INTO user (user_name) ' +
					'VALUES (?);',
					[ self.username ],
					function userInsert(err) {
						if(err) {
							callback(err);
						} else {
							self.userId = this.lastID;

							//	Do not require activation for userId 1 (root/admin)
							if(1 === self.userId) {
								self.properties.account_status = User.AccountStatus.active;
							}
							
							callback(null);
						}
					}
				);
			},
			function genAuthCredentials(callback) {
				generatePasswordDerivedKeyAndSalt(options.password, function dkAndSalt(err, info) {
					if(err) {
						callback(err);
					} else {
						self.properties.pw_pbkdf2_salt	= info.salt;
						self.properties.pw_pbkdf2_dk	= info.dk;
						callback(null);
					}
				});
			},
			function setInitialGroupMembership(callback) {
				self.groups = Config.users.defaultGroups;

				if(1 === self.userId) {	//	root/SysOp?
					self.groups.push('sysops');
				}

				callback(null);
			},
			function saveAll(callback) {
				self.persist(false, function persisted(err) {
					callback(err);
				});
			}
		],
		function complete(err) {
			if(err) {
				var originalError = err;
				userDb.run('ROLLBACK;', function rollback(err) {
					assert(!err);
					cb(originalError);
				});
			} else {
				userDb.run('COMMIT;', function commited(err) {
					cb(err);
				});
			}
		}
	);
};

User.prototype.persist = function(useTransaction, cb) {
	assert(this.userId > 0);

	var self = this;

	async.series(
		[
			function beginTransaction(callback) {
				if(useTransaction) {
					userDb.run('BEGIN;', function transBegin(err) {
						callback(err);
					});
				} else {
					callback(null);
				}
			},
			function saveProps(callback) {
				self.persistAllProperties(function persisted(err) {
					callback(err);
				});
			},
			function saveGroups(callback) {
				userGroup.addUserToGroups(self.userId, self.groups, function groupsSaved(err) {
					callback(err);
				});
			}
		],
		function complete(err) {
			if(err) {
				if(useTransaction) {
					userDb.run('ROLLBACK;', function rollback(err) {
						cb(err);
					});
				} else {
					cb(err);
				}
			} else {
				if(useTransaction) {
					userDb.run('COMMIT;', function commited(err) {
						cb(err);
					});
				} else {
					cb(null);
				}
			}
		}
	);
};

User.prototype.persistProperty = function(propName, propValue, cb) {
	//	update live props
	this.properties[propName] = propValue;

	userDb.run(
		'REPLACE INTO user_property (user_id, prop_name, prop_value) ' + 
		'VALUES (?, ?, ?);', 
		[ this.userId, propName, propValue ], 
		function ran(err) {
			if(cb) {
				cb(err);
			}
		}
	);
};

User.prototype.persistProperties = function(properties, cb) {
	var self = this;

	//	update live props
	_.merge(this.properties, properties);

	var stmt = userDb.prepare(
		'REPLACE INTO user_property (user_id, prop_name, prop_value) ' + 
		'VALUES (?, ?, ?);');

	async.each(Object.keys(properties), function property(propName, callback) {
		stmt.run(self.userId, propName, properties[propName], function onRun(err) {
			callback(err);
		});
	}, function complete(err) {
		if(err) {
			cb(err);
		} else {
			stmt.finalize(function finalized() {
				cb(null);
			});
		}
	});
};

User.prototype.persistAllProperties = function(cb) {
	assert(this.userId > 0);

	this.persistProperties(this.properties, cb);
};

User.prototype.setNewAuthCredentials = function(password, cb) {
	var self = this;

	generatePasswordDerivedKeyAndSalt(password, function dkAndSalt(err, info) {
		if(err) {
			cb(err);
		} else {
			var newProperties = {
				pw_pbkdf2_salt	: info.salt,
				pw_pbkdf2_dk	: info.dk,
			};

			self.persistProperties(newProperties, function persisted(err) {
				cb(err);
			});
		}
	});
};

User.prototype.getAge = function() {
	if(_.has(this.properties, 'birthdate')) {
		return moment().diff(this.properties.birthdate, 'years');
	}
};

///////////////////////////////////////////////////////////////////////////////
//	Exported methods
///////////////////////////////////////////////////////////////////////////////
function getUserIdAndName(username, cb) {
	userDb.get(
		'SELECT id, user_name ' +
		'FROM user ' +
		'WHERE user_name LIKE ?;',
		[ username ],
		function onResults(err, row) {
			if(err) {
				cb(err);
			} else {
				if(row) {
					cb(null, row.id, row.user_name);
				} else {
					cb(new Error('No matching username'));
				}
			}
		}
	);
}

function getUserName(userId, cb) {
	userDb.get(
		'SELECT user_name ' +
		'FROM user '		+
		'WHERE id=?;', [ userId ],
		function got(err, row) {
			if(err) {
				cb(err);
			} else {
				if(row) {
					cb(null, row.user_name);
				} else {
					cb(new Error('No matching user ID'));
				}
			}
		}
	);
}

///////////////////////////////////////////////////////////////////////////////
//	Internal utility methods
///////////////////////////////////////////////////////////////////////////////
function generatePasswordDerivedKeyAndSalt(password, cb) {
	async.waterfall(
		[
			function getSalt(callback) {
				generatePasswordDerivedKeySalt(function onSalt(err, salt) {
					callback(err, salt);
				});
			},
			function getDk(salt, callback) {
				generatePasswordDerivedKey(password, salt, function onDk(err, dk) {
					callback(err, salt, dk);
				});
			}
		],
		function onComplete(err, salt, dk) {
			cb(err, { salt : salt, dk : dk });
		}
	);
}

function generatePasswordDerivedKeySalt(cb) {
	crypto.randomBytes(User.PBKDF2.saltLen, function onRandSalt(err, salt) {
		if(err) {
			cb(err);
		} else {
			cb(null, salt.toString('hex'));
		}
	});
}

function generatePasswordDerivedKey(password, salt, cb) {
	password = new Buffer(password).toString('hex');
	crypto.pbkdf2(password, salt, User.PBKDF2.iterations, User.PBKDF2.keyLen, function onDerivedKey(err, dk) {
		if(err) {
			cb(err);
		} else {
			cb(null, dk.toString('hex'));
		}
	});
}

function loadProperties(options, cb) {
	assert(options.userId);

	var sql =
		'SELECT prop_name, prop_value ' +
		'FROM user_property ' +
		'WHERE user_id = ?';

	if(options.names) {
		sql +=' AND prop_name IN("' + options.names.join('","') + '");';
	} else {
		sql += ';';
	}

	var properties = {};

	userDb.each(sql, [ options.userId ], function onRow(err, row) {
		if(err) {
			cb(err);
			return;
		} else {
			properties[row.prop_name] = row.prop_value;
		}
	}, function complete() {
		cb(null, properties);
	});
}

//	:TODO: make this much more flexible - propValue should allow for case-insensitive compare, etc.
function getUserIdsWithProperty(propName, propValue, cb) {
	var userIds = [];

	userDb.each(
		'SELECT user_id '		+
		'FROM user_property	'	+
		'WHERE prop_name = ? AND prop_value = ?;',
		[ propName, propValue ], 
		function rowEntry(err, row) {
			if(!err) {
				userIds.push(row.user_id);
			}
		}, 
		function complete() {
			cb(null, userIds);
		}
	);
}

function getUserList(options, cb) {
	var userList = [];

	var orderClause = 'ORDER BY ' + (options.order || 'user_name');

	userDb.each(
		'SELECT id, user_name '			+
		'FROM user '					+
		orderClause + ';',
		function userRow(err, row) {
			userList.push({
				userId		: row.id,
				userName	: row.user_name,
			});
		},
		function usersComplete(err) {
			options.properties = options.properties || [];
			async.map(userList, function iter(user, callback) {
				userDb.each(
					'SELECT prop_name, prop_value '	+
					'FROM user_property '			+
					'WHERE user_id=? AND prop_name IN ("' + options.properties.join('","') + '");',
					[ user.userId ],
					function propRow(err, row) {
						user[row.prop_name] = row.prop_value;
					},
					function complete(err) {							
						callback(err, user);
					}
				);
			}, function propsComplete(err, transformed) {
				cb(err, transformed);
			});
		}
	);
}
