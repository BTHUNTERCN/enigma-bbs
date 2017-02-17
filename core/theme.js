/* jslint node: true */
'use strict';

const Config			= require('./config.js').config;
const art				= require('./art.js');
const ansi				= require('./ansi_term.js');
const Log				= require('./logger.js').log;
const configCache		= require('./config_cache.js');
const getFullConfig		= require('./config_util.js').getFullConfig;
const asset				= require('./asset.js');
const ViewController	= require('./view_controller.js').ViewController;
const Errors			= require('./enig_error.js').Errors;

const fs				= require('fs');
const paths				= require('path');
const async				= require('async');
const _					= require('lodash');
const assert			= require('assert');

exports.getThemeArt				= getThemeArt;
exports.getAvailableThemes		= getAvailableThemes;
exports.getRandomTheme			= getRandomTheme;
exports.setClientTheme          = setClientTheme;
exports.initAvailableThemes		= initAvailableThemes;
exports.displayThemeArt			= displayThemeArt;
exports.displayThemedPause		= displayThemedPause;
exports.displayThemedPrompt		= displayThemedPrompt;
exports.displayThemedAsset		= displayThemedAsset;

function refreshThemeHelpers(theme) {
	//
	//	Create some handy helpers
	//
	theme.helpers = {
		getPasswordChar : function() {
			var pwChar = Config.defaults.passwordChar;
			if(_.has(theme, 'customization.defaults.general')) {
				var themePasswordChar = theme.customization.defaults.general.passwordChar;
				if(_.isString(themePasswordChar)) {
					pwChar = themePasswordChar.substr(0, 1);
				} else if(_.isNumber(themePasswordChar)) {
					pwChar = String.fromCharCode(themePasswordChar);
				}
			}
			return pwChar;
		},
		getDateFormat : function(style) {
			style = style || 'short';

			var format = Config.defaults.dateFormat[style] || 'MM/DD/YYYY';

			if(_.has(theme, 'customization.defaults.dateFormat')) {
				return theme.customization.defaults.dateFormat[style] || format;
			}
			return format;
		},
		getTimeFormat : function(style) {
			style = style || 'short';

			var format = Config.defaults.timeFormat[style] || 'h:mm a';

			if(_.has(theme, 'customization.defaults.timeFormat')) {
				return theme.customization.defaults.timeFormat[style] || format;
			}
			return format;
		},
		getDateTimeFormat : function(style) {
			style = style || 'short';

			var format = Config.defaults.dateTimeFormat[style] || 'MM/DD/YYYY h:mm a';

			if(_.has(theme, 'customization.defaults.dateTimeFormat')) {
				return theme.customization.defaults.dateTimeFormat[style] || format;
			}

			return format;
		}
	};
}

function loadTheme(themeID, cb) {

	var path = paths.join(Config.paths.themes, themeID, 'theme.hjson');

	configCache.getConfigWithOptions( { filePath : path, forceReCache : true }, function loaded(err, theme) {
		if(err) {
			cb(err);
		} else {
			if(!_.isObject(theme.info) || 
				!_.isString(theme.info.name) ||
				!_.isString(theme.info.author))
			{
				cb(new Error('Invalid or missing "info" section!'));
				return;
			}

			refreshThemeHelpers(theme);

			cb(null, theme, path);
		}
	});
}

const availableThemes = {};

const IMMUTABLE_MCI_PROPERTIES = [
	'maxLength', 'argName', 'submit', 'validate'
];

function getMergedTheme(menuConfig, promptConfig, theme) {
	assert(_.isObject(menuConfig));
	assert(_.isObject(theme));
    
    //  :TODO: merge in defaults (customization.defaults{} )
    //	:TODO: apply generic stuff, e.g. "VM" (vs "VM1")
    
    //
    //  Create a *clone* of menuConfig (menu.hjson) then bring in
    //  promptConfig (prompt.hjson)
    //
	var mergedTheme = _.cloneDeep(menuConfig);
    
	if(_.isObject(promptConfig.prompts)) {
		mergedTheme.prompts = _.cloneDeep(promptConfig.prompts);
	}

	//
	//  Add in data we won't be altering directly from the theme
	//
	mergedTheme.info    = theme.info;
	mergedTheme.helpers = theme.helpers;

	//
	//  merge customizer to disallow immutable MCI properties
	//	
	var mciCustomizer = function(objVal, srcVal, key) {		
		return IMMUTABLE_MCI_PROPERTIES.indexOf(key) > -1 ? objVal : srcVal;
	};

	function getFormKeys(fromObj) {
		return _.remove(_.keys(fromObj), function pred(k) {
			return !isNaN(k);    //  remove all non-numbers
		});
	}

	function mergeMciProperties(dest, src) {
		Object.keys(src).forEach(function mciEntry(mci) {
			_.mergeWith(dest[mci], src[mci], mciCustomizer);
		});
	}

	function applyThemeMciBlock(dest, src, formKey) {
		if(_.isObject(src.mci)) {
			mergeMciProperties(dest, src.mci);
		} else {
			if(_.has(src, [ formKey, 'mci' ])) {
				mergeMciProperties(dest, src[formKey].mci);
			}            
		}
	}
    
    //
    //  menu.hjson can have a couple different structures:
    //  1)  Explicit declaration of expected MCI code(s) under 'form:<id>' before a 'mci' block
    //      (this allows multiple layout types defined by one menu for example)
    //
    //  2)  Non-explicit declaration: 'mci' directly under 'form:<id>'
    //
    //  theme.hjson has it's own mix:
    //  1)  Explicit: Form ID before 'mci' (generally used where there are > 1 forms)
    //
    //  2)  Non-explicit: 'mci' directly under an entry
    //
    //  Additionally, #1 or #2 may be under an explicit key of MCI code(s) to match up
    //  with menu.hjson in #1. 
    //
    //  *   When theming an explicit menu.hjson entry (1), we will use a matching explicit
    //      entry with a matching MCI code(s) key in theme.hjson (e.g. menu="ETVM"/theme="ETVM"
    //      and fall back to generic if a match is not found. 
    //
    //  *   If theme.hjson provides form ID's, use them. Otherwise, we'll apply directly assuming
    //      there is a generic 'mci' block.
    //    
	function applyToForm(form, menuTheme, formKey) {     
		if(_.isObject(form.mci)) {
			//   non-explicit: no MCI code(s) key assumed since we found 'mci' directly under form ID
			applyThemeMciBlock(form.mci, menuTheme, formKey);
			
		} else {
			var menuMciCodeKeys = _.remove(_.keys(form), function pred(k) {
				return k === k.toUpperCase(); //  remove anything not uppercase 
			});
			
			menuMciCodeKeys.forEach(function mciKeyEntry(mciKey) {
				var applyFrom; 
				if(_.has(menuTheme, [ mciKey, 'mci' ])) {
					applyFrom = menuTheme[mciKey];
				} else {
					applyFrom = menuTheme;
				}
				
				applyThemeMciBlock(form[mciKey].mci, applyFrom);
			});
		}
	}
    
	[ 'menus', 'prompts' ].forEach(function areaEntry(sectionName) {
		_.keys(mergedTheme[sectionName]).forEach(function menuEntry(menuName) {
			var createdFormSection = false;
			var mergedThemeMenu = mergedTheme[sectionName][menuName];
			
			if(_.has(theme, [ 'customization', sectionName, menuName ])) {
				var menuTheme = theme.customization[sectionName][menuName];
				
				//	config block is direct assign/overwrite
				//  :TODO: should probably be _.merge()
				if(menuTheme.config) {
					mergedThemeMenu.config = _.assign(mergedThemeMenu.config || {}, menuTheme.config);
				}
			
				if('menus' === sectionName) {
					if(_.isObject(mergedThemeMenu.form)) {
						getFormKeys(mergedThemeMenu.form).forEach(function formKeyEntry(formKey) {
							applyToForm(mergedThemeMenu.form[formKey], menuTheme, formKey);
						});
					} else {
						if(_.isObject(menuTheme.mci)) {
							//
							//  Not specified at menu level means we apply anything from the
							//  theme to form.0.mci{}
							//                            
							mergedThemeMenu.form = { 0 : { mci : { } } };
							mergeMciProperties(mergedThemeMenu.form[0], menuTheme);
							createdFormSection = true;
						}
					}
				} else if('prompts' === sectionName) {
					//  no 'form' or form keys for prompts -- direct to mci
					applyToForm(mergedThemeMenu, menuTheme);
				}                
			}
			
			//
			//  Finished merging for this menu/prompt
			//
			//  If the following conditions are true, set runtime.autoNext to true:
			//  *   This is a menu
			//  *   There is/was no explicit 'form' section
			//  *   There is no 'prompt' specified
			//
			if('menus' === sectionName && !_.isString(mergedThemeMenu.prompt) &&
				(createdFormSection || !_.isObject(mergedThemeMenu.form)))
			{
				mergedThemeMenu.runtime = _.merge(mergedThemeMenu.runtime || {}, { autoNext : true } );
			}
		});
	});
	

	return mergedTheme;
}

function initAvailableThemes(cb) {
	var menuConfig;
	var promptConfig;
   
	async.waterfall(
		[
			function loadMenuConfig(callback) {
				getFullConfig(Config.general.menuFile, function gotConfig(err, mc) {
					menuConfig = mc;
					callback(err);
				});
			},
			function loadPromptConfig(callback) {
				getFullConfig(Config.general.promptFile, function gotConfig(err, pc) {
					promptConfig = pc;
					callback(err); 
				});
			},
			function getDir(callback) {
				fs.readdir(Config.paths.themes, function dirRead(err, files) {
					callback(err, files);
				});
			},
			function filterFiles(files, callback) {				
				var filtered = files.filter(function filter(file) {
					return fs.statSync(paths.join(Config.paths.themes, file)).isDirectory(); 
				});
				callback(null, filtered);
			},
			function populateAvailable(filtered, callback) {
                //  :TODO: this is a bit broken with callback placement and configCache.on() handler
                
				filtered.forEach(function themeEntry(themeId) {
					loadTheme(themeId, function themeLoaded(err, theme, themePath) {
						if(!err) {
							availableThemes[themeId] = getMergedTheme(menuConfig, promptConfig, theme);

							configCache.on('recached', function recached(path) {
								if(themePath === path) {									
									loadTheme(themeId, function reloaded(err, reloadedTheme) {
										Log.debug( { info : theme.info }, 'Theme recached' );

										availableThemes[themeId] = reloadedTheme;
									});
								}
							});

							Log.debug( { info : theme.info }, 'Theme loaded');
						} else {
							Log.warn( { themeId : themeId, error : err.toString() }, 'Failed to load theme');
						}
					});

				});
				callback(null);
			}
		],
		function onComplete(err) {
			if(err) {
				cb(err);
				return;
			}

			cb(null, availableThemes.length);
		}
	);
}

function getAvailableThemes() {
	return availableThemes;
}

function getRandomTheme() {
	if(Object.getOwnPropertyNames(availableThemes).length > 0) {
		var themeIds = Object.keys(availableThemes);
		return themeIds[Math.floor(Math.random() * themeIds.length)];
	}
}

function setClientTheme(client, themeId) {
	var desc;

	try {
		client.currentTheme = getAvailableThemes()[themeId];
		desc = 'Set client theme';        
	} catch(e) {
		client.currentTheme = getAvailableThemes()[Config.defaults.theme];
		desc = 'Failed setting theme by supplied ID; Using default';
	}

	client.log.debug( { themeId : themeId, info : client.currentTheme.info }, desc);
}

function getThemeArt(options, cb) {
	//
	//	options - required:
	//		name
	//	
	//	options - optional
	//		client - needed for user's theme/etc.
	//		themeId
	//		asAnsi
	//		readSauce
	//		random
	//
	if(!options.themeId && _.has(options, 'client.user.properties.theme_id')) {
		options.themeId = options.client.user.properties.theme_id;
	} else {
		options.themeId = Config.defaults.theme;
	}

	//	:TODO: replace asAnsi stuff with something like retrieveAs = 'ansi' | 'pipe' | ...
	//	:TODO: Some of these options should only be set if not provided!
	options.asAnsi		= true;	//	always convert to ANSI
	options.readSauce	= true;	//	read SAUCE, if avail
	options.random		= _.isBoolean(options.random) ? options.random : true;	//	FILENAME<n>.EXT support

	//
	//	We look for themed art in the following manor:
	//	* Supplied theme via |themeId|
	//	* Fallback 1: Default theme (if different than |themeId|)
	//	* General art directory
	//
	async.waterfall(
		[
			function fromPath(callback) {
				//
				//	We allow relative (to enigma-bbs) or full paths
				//
				if('/' === options.name[0]) {
					//	just take the path as-is
					options.basePath = paths.dirname(options.name);					
				} else if(options.name.indexOf('/') > -1) {
					//	make relative to base BBS dir
					options.basePath = paths.join(__dirname, '../', paths.dirname(options.name));
				} else {
					return callback(null, null);
				}

				art.getArt(options.name, options, (err, artInfo) => {
					return callback(null, artInfo);
				});
			},
			function fromSuppliedTheme(artInfo, callback) {
				if(artInfo) {
					return callback(null, artInfo);
				}

				options.basePath = paths.join(Config.paths.themes, options.themeId);

				art.getArt(options.name, options, function artLoaded(err, artInfo) {
					callback(null, artInfo);
				});
			},
			function fromDefaultTheme(artInfo, callback) {
				if(artInfo || Config.defaults.theme === options.themeId) {
					callback(null, artInfo);
				} else {
					options.basePath = paths.join(Config.paths.themes, Config.defaults.theme);

					art.getArt(options.name, options, function artLoaded(err, artInfo) {
						callback(null, artInfo);
					});
				}
			},
			function fromGeneralArtDir(artInfo, callback) {
				if(artInfo) {
					callback(null, artInfo);
				} else {
					options.basePath = Config.paths.art;

					art.getArt(options.name, options, function artLoaded(err, artInfo) {
						callback(err, artInfo);
					});
				}
			}
		],
		function complete(err, artInfo) {
			if(err) {
				if(options.client) {
					options.client.log.debug( { error : err.message }, 'Cannot find theme art' );
				} else {
					Log.debug( { error : err.message }, 'Cannot find theme art' );
				}
			}
			return cb(err, artInfo);
		}
	);
}

function displayThemeArt(options, cb) {
	assert(_.isObject(options));
	assert(_.isObject(options.client));
	assert(_.isString(options.name));

	getThemeArt(options, function themeArt(err, artInfo) {
		if(err) {
			cb(err);
		} else {
			//	:TODO: just use simple merge of options -> displayOptions
			/*
			var dispOptions = {
				art				: artInfo.data,
				sauce			: artInfo.sauce,
				client			: options.client,
				font			: options.font,
				trailingLF		: options.trailingLF,
			};

			art.display(dispOptions, function displayed(err, mciMap, extraInfo) {
				cb(err, { mciMap : mciMap, artInfo : artInfo, extraInfo : extraInfo } );
			});
			*/
			const displayOpts = {
				sauce		: artInfo.sauce,
				font		: options.font,
				trailingLF	: options.trailingLF,
			};

			art.display(options.client, artInfo.data, displayOpts, (err, mciMap, extraInfo) => {
				return cb(err, { mciMap : mciMap, artInfo : artInfo, extraInfo : extraInfo } );
			});
		}
	});
}

/*
function displayThemedPrompt(name, client, options, cb) {
	
	async.waterfall(
		[
			function loadConfig(callback) {
				configCache.getModConfig('prompt.hjson', (err, promptJson) => {
					if(err) {
						return callback(err);
					}

					if(_.has(promptJson, [ 'prompts', name ] )) {
						return callback(Errors.DoesNotExist(`Prompt "${name}" does not exist`));
					}

					const promptConfig = promptJson.prompts[name];
					if(!_.isObject(promptConfig)) {
						return callback(Errors.Invalid(`Prompt "${name} is invalid`));
					}

					return callback(null, promptConfig);
				});
			},
			function display(promptConfig, callback) {
				if(options.clearScreen) {
					client.term.rawWrite(ansi.clearScreen());
				}

				//
				//	If we did not clear the screen, don't let the font change
				//				
				const dispOptions = Object.assign( {}, promptConfig.options );
				if(!options.clearScreen) {
					dispOptions.font = 'not_really_a_font!';
				}

				displayThemedAsset(
					promptConfig.art, 
					client,
					dispOptions,
					(err, artData) => {
						if(err) {
							return callback(err);
						}

						return callback(null, promptConfig, artData.mciMap);
					}
				);
			},
			function prepViews(promptConfig, mciMap, callback) {
				vc = new ViewController( { client : client } );

				const loadOpts = {
					promptName	: name,
					mciMap		: mciMap,
					config		: promptConfig,
				};

				vc.loadFromPromptConfig(loadOpts, err => {
					callback(null);
				});
			}
		]
	);
}
*/

function displayThemedPrompt(name, client, options, cb) {

	const useTempViewController = _.isUndefined(options.viewController);

	async.waterfall(
		[
			function display(callback) {
				const promptConfig = client.currentTheme.prompts[name];
				if(!promptConfig) {
					return callback(Errors.DoesNotExist(`Missing "${name}" prompt configuration!`));
				}

				if(options.clearScreen) {
					client.term.rawWrite(ansi.resetScreen());
				}

				//
				//	If we did *not* clear the screen, don't let the font change
				//	as it will mess with the output of the existing art displayed in a terminal
				//				
				const dispOptions = Object.assign( {}, promptConfig.options );
				if(!options.clearScreen) {
					dispOptions.font = 'not_really_a_font!';	//	kludge :)
				}

				displayThemedAsset(
					promptConfig.art, 
					client,
					dispOptions,
					(err, artInfo) => {
						return callback(err, promptConfig, artInfo);
					}
				);
			},
			function discoverCursorPosition(promptConfig, artInfo, callback) {
				if(!options.clearPrompt) {
					//	no need to query cursor - we're not gonna use it
					return callback(null, promptConfig, artInfo);
				}
				
				client.once('cursor position report', pos => {
					artInfo.startRow = pos[0] - artInfo.height;
					return callback(null, promptConfig, artInfo);
				});

				client.term.rawWrite(ansi.queryPos());
			},
			function createMCIViews(promptConfig, artInfo, callback) {
				const tempViewController = useTempViewController ? new ViewController( { client : client } ) : options.viewController;

				const loadOpts = {
					promptName	: name,
					mciMap		: artInfo.mciMap,
					config		: promptConfig,
				};

				tempViewController.loadFromPromptConfig(loadOpts, () => {
					return callback(null, artInfo, tempViewController);
				});
			},
			function pauseForUserInput(artInfo, tempViewController, callback) {
				if(!options.pause) {
					return callback(null, artInfo, tempViewController);
				}

				client.waitForKeyPress( () => {
					return callback(null, artInfo, tempViewController);
				});
			},
			function clearPauseArt(artInfo, tempViewController, callback) {
				if(options.clearPrompt) {
					if(artInfo.startRow && artInfo.height) {
						client.term.rawWrite(ansi.goto(artInfo.startRow, 1));
						
						//	Note: Does not work properly in NetRunner < 2.0b17:
						client.term.rawWrite(ansi.deleteLine(artInfo.height));
					} else {
						client.term.rawWrite(ansi.eraseLine(1));
					}
				}

				return callback(null, tempViewController);
			}
		],
		(err, tempViewController) => {
			if(err) {
				client.log.warn( { error : err.message }, `Failed displaying "${name}" prompt` );
			}

			if(tempViewController && useTempViewController) {
				tempViewController.detachClientEvents();
			}

			return cb(null);
		}
	);
}

//
//	Pause prompts are a special prompt by the name 'pause'.
//	
function displayThemedPause(client, options, cb) {

	if(!cb && _.isFunction(options)) {
		cb = options;
		options = {};
	}

	if(!_.isBoolean(options.clearPrompt)) {
		options.clearPrompt = true;
	}

	const promptOptions = Object.assign( {}, options, { pause : true } );
	return displayThemedPrompt('pause', client, promptOptions, cb);
}

function displayThemedAsset(assetSpec, client, options, cb) {
	assert(_.isObject(client));

	//	options are... optional
	if(3 === arguments.length) {
		cb = options;
		options = {};
	}

	const artAsset = asset.getArtAsset(assetSpec);
	if(!artAsset) {
		return cb(new Error('Asset not found: ' + assetSpec));
	}

	//	:TODO: just use simple merge of options -> displayOptions
	var dispOpts = {
		name			: artAsset.asset,
		client			: client,
		font			: options.font,
		trailingLF		: options.trailingLF,
	};

	switch(artAsset.type) {
		case 'art' :
			displayThemeArt(dispOpts, function displayed(err, artData) {
				return cb(err, err ? null : { mciMap : artData.mciMap, height : artData.extraInfo.height } );
			});
			break;

		case 'method' : 
			//	:TODO: fetch & render via method
			break;

		case 'inline ' :
			//	:TODO: think about this more in relation to themes, etc. How can this come
			//	from a theme (with override from menu.json) ???
			//	look @ client.currentTheme.inlineArt[name] -> menu/prompt[name]
			break;

		default :
			return cb(new Error('Unsupported art asset type: ' + artAsset.type));
	}
}