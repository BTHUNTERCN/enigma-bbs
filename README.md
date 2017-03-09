# ENiGMA½ BBS Software

![alt text](http://i325.photobucket.com/albums/k361/request4spam/enigma.ans_zps05w2ey4s.png "ENiGMA½ BBS")

ENiGMA½ is a modern BBS software with a nostalgic flair!


## Features Available Now
 * Multi platform: Anywhere [Node.js](https://nodejs.org/) runs likely works (known to work under Linux, FreeBSD, OpenBSD, OS X and Windows)
 * Unlimited multi node support (for all those BBS "callers"!)
 * **Highly** customizable via [HJSON](http://hjson.org/) based configuration, menus, and themes in addition to JavaScript based mods
 * MCI support for lightbars, toggles, input areas, and so on plus many other other bells and whistles
 * Telnet & **SSH** access built in. Additional servers are easy to implement
 * [CP437](http://www.ascii-codes.com/) and UTF-8 output
 * [SyncTerm](http://syncterm.bbsdev.net/) style font and baud emulation support. Display PC/DOS and Amiga style artwork as it's intended! In general, ANSI-BBS / [cterm.txt](http://cvs.synchro.net/cgi-bin/viewcvs.cgi/*checkout*/src/conio/cterm.txt?content-type=text%2Fplain&revision=HEAD) / [bansi.txt](http://www.bbsdocumentary.com/library/PROGRAMS/GRAPHICS/ANSI/bansi.txt) are followed for expected BBS behavior
 * [SAUCE](http://www.acid.org/info/sauce/sauce.htm) support
 * Renegade style pipe color codes
 * [SQLite](http://sqlite.org/) storage of users, message areas, and so on
 * Strong [PBKDF2](https://en.wikipedia.org/wiki/PBKDF2) backed password encryption
 * [Door support](docs/doors.md) including common dropfile formats for legacy DOS doors. Built in [BBSLink](http://bbslink.net/), and [DoorParty](http://forums.throwbackbbs.com/) support!
 * [Bunyan](https://github.com/trentm/node-bunyan) logging
 * [Message networks](docs/msg_networks.md) with FidoNet Type Network (FTN) + BinkleyTerm Style Outbound (BSO) message import/export
 * [Gazelle](https://github.com/WhatCD/Gazelle) inspirted File Bases including fast fully indexed full text search (FTS), #tags, and HTTP(S) temporary download URLs using a built in [web server](docs/web_server.md). Legacy X/Y/Z modem also supported!
 * Upload processor supporting [FILE_ID.DIZ](https://en.wikipedia.org/wiki/FILE_ID.DIZ) and [NFO](https://en.wikipedia.org/wiki/.nfo) extraction, year estimation, and more!
 
## In the Works
* More ES6+ usage, and **documentation**!
* More ACS support coverage
* SysOp dashboard (ye ol' WFC)
* Missing functionality such as message FTS, user coloring of messages in the FST, etc.
* String localization
* A lot more! Feel free to request features via [the issue tracker](https://github.com/NuSkooler/enigma-bbs/issues)

## Known Issues
As of now this is considered **alpha** code! Please **expect bugs** :bug: -- and when you find them, log issues and/or submit pull requests. Feature requests, suggestions, and so on are always welcome! I am also **looking for semi dedicated testers, artists, etc**!

See [the issue tracker](https://github.com/NuSkooler/enigma-bbs/issues) for more information.

## Support
* Use [the issue tracker](https://github.com/NuSkooler/enigma-bbs/issues)
* **Discussion on a ENiGMA BBS!** (see Boards below)
* IRC: **#enigma-bbs** on **chat.freenode.net**
* Email: bryan -at- l33t.codes
* [Facebook ENiGMA½ group](https://www.facebook.com/groups/enigmabbs/)
* ENiGMA discussion on [fsxNet](http://bbs.geek.nz/#fsxNet)

## Terminal Clients
ENiGMA has been tested with many terminals. However, the following are suggested for BBSing:
* [SyncTERM](http://syncterm.bbsdev.net/)
* [EtherTerm](https://github.com/M-griffin/EtherTerm)
* [NetRunner](http://mysticbbs.com/downloads.html)

## Boards
* WQH: :skull: Xibalba :skull: (**telnet://xibalba.l33t.codes:44510**)
* Exotica: (**telnet://andrew.homeunix.org:2023**)
* [force9](http://bbs.force9.org/): (**telnet://bbs.force9.org**)


## Installation
```
curl -o- https://raw.githubusercontent.com/NuSkooler/enigma-bbs/master/misc/install.sh | bash
```
<br>
(See the [Quickstart](docs/index.md#quickstart) for more information)

## Special Thanks
* [M. Brutman](http://www.brutman.com/), author of [mTCP](http://www.brutman.com/mTCP/mTCP.html) (Interwebs for DOS!)
* [M. Griffin](https://github.com/M-griffin), author of [Enthral BBS](https://github.com/M-griffin/Enthral), [Oblivion/2 XRM](https://github.com/M-griffin/Oblivion2-XRM) and [EtherTerm](https://github.com/M-griffin/EtherTerm)!
* [Caphood](http://www.reddit.com/user/Caphood), supreme SysOp of [BLACK ƒlag](http://www.bbsnexus.com/directory/listing/blackflag.html) BBS
* [Luciano Ayres](http://www.lucianoayres.com.br/) of [Blocktronics](http://blocktronics.org/), creator of the "Mystery Skulls" default ENiGMA½ theme!
* Sudndeath for Xibalba ANSI work!
* Jack Phlash for kick ass ENiGMA½ and Xibalba ASCII (Check out [IMPURE60](http://pc.textmod.es/pack/impure60/)!!)
* Avon of [Agency BBS](http://bbs.geek.nz/) and [fsxNet](http://bbs.geek.nz/#fsxNet)
* Maskreet of [Throwback BBS](http://www.throwbackbbs.com/) hosting [DoorParty](http://forums.throwbackbbs.com/)!
* [Apam](https://github.com/apamment) of HappyLand BBS and [HappyNet](http://andrew.homeunix.org/doku.php?id=happynet)!

## License
Released under the [BSD 2-clause](https://opensource.org/licenses/BSD-2-Clause) license:

Copyright (c) 2015-2017, Bryan D. Ashby
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
