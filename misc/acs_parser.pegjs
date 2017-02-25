
{
	var client	= options.client;
	var user	= options.client.user;

	var _		= require('lodash');
	var assert	= require('assert');

	function checkAccess(acsCode, value) {
		try {
			return {
				LC	: function isLocalConnection() {
					return client.isLocal();
				},
				AG	: function ageGreaterOrEqualThan() {
					return !isNaN(value) && user.getAge() >= value;
				},
				AS	: function accountStatus() {
					if(!_.isArray(value)) {
						value = [ value ];
					}

					const userAccountStatus = parseInt(user.properties.account_status, 10);
					value = value.map(n => parseInt(n, 10));	//	ensure we have integers
					return value.indexOf(userAccountStatus) > -1;
				},
				EC	: function isEncoding() {
					switch(value) {
						case 0	: return 'cp437' === client.term.outputEncoding.toLowerCase();
						case 1	: return 'utf-8' === client.term.outputEncoding.toLowerCase();
						default	: return false;
					}
				},
				GM	: function isOneOfGroups() {
					if(!_.isArray(value)) {
						return false;
					}

					return _.findIndex(value, function cmp(groupName) {
						return user.isGroupMember(groupName);
					}) > - 1;
				},
				NN	: function isNode() {
					return client.node === value;
				},
				NP	: function numberOfPosts() {
					const postCount = parseInt(user.properties.post_count, 10);
					return !isNaN(value) && postCount >= value;
				},
				NC	: function numberOfCalls() {
					const loginCount = parseInt(user.properties.login_count, 10);
					return !isNaN(value) && loginCount >= value;
				},
				SC 	: function isSecureConnection() {
					return client.session.isSecure;
				},
				ML	: function minutesLeft() {
					//	:TODO: implement me!
					return false;
				},
				TH	: function termHeight() {
					return !isNaN(value) && client.term.termHeight >= value;
				},
				TM	: function isOneOfThemes() {
					if(!_.isArray(value)) {
						return false;
					}

					return value.indexOf(client.currentTheme.name) > -1;
				},
				TT	: function isOneOfTermTypes() {
					if(!_.isArray(value)) {
						return false;
					}

					return value.indexOf(client.term.termType) > -1;
				},
				TW	: function termWidth() {
					return !isNaN(value) && client.term.termWidth >= value;
				},
				ID	: function isUserId(value) {
					if(!_.isArray(value)) {
						value = [ value ];
					}

					value = value.map(n => parseInt(n, 10));	//	ensure we have integers
					return value.indexOf(user.userId) > -1;
				},
				WD	: function isOneOfDayOfWeek() {
					if(!_.isArray(value)) {
						value = [ value ];
					}

					value = value.map(n => parseInt(n, 10));	//	ensure we have integers
					return value.indexOf(new Date().getDay()) > -1;
				},
				MM	: function isMinutesPastMidnight() {
					//	:TODO: return true if value is >= minutes past midnight sys time
					return false;
				}
			}[acsCode](value);
		} catch (e) {
			client.log.warn( { acsCode : acsCode, value : value }, 'Invalid ACS string!');
			return false;
		}
	}
}

start
	= expr

expr
	= orExpr

OR
	= '|'

AND
	= '&'

NOT
	= '!'

groupOpen
	= '('

groupClose
	= ')'

orExpr
	= left:andExpr OR right:expr { return left || right; }
	/ andExpr

andExpr
	= left:notExpr AND? right:expr { return left && right; }
	/ notExpr

notExpr
	= NOT value:atom { return !value; }
	/ atom

atom
	= acsCheck
	/ groupOpen value:expr groupClose { return value; }

comma
	= ','

ws 
	= ' '

optWs
	= ws*

listOpen
	= '['

listClose
	= ']'

acsCheck
	= acs:acsCode a:arg { return checkAccess(acs, a); }

acsCode
	= c:([A-Z][A-Z]) { return c.join(''); }

argVar
	= a:[A-Za-z0-9\-_\+]+ { return a.join('') }

commaList
	= start:(v:argVar optWs comma optWs { return v; })* last:argVar { return start.concat(last); }

list
	= listOpen l:commaList listClose { return l; }

number
	= d:([0-9]+) { return parseInt(d.join(''), 10); }

arg
	= list
	/ num:number?

 