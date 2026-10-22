# CleanFrame Launcher

A [TizenBrew](https://github.com/reisxd/TizenBrew) module that runs a tiny local service on a Samsung TV. It starts TV apps the way `sdb shell 0 was_execute <app id>` does, for apps that Tizen ignores when they are launched from a web app with `tizen.application.launch` (BBC iPlayer on a 2019 UK model, for example).

- Listens on `127.0.0.1:8082` only.
- `GET /ping` replies `{"ok":true}`.
- `GET /launch?id=<app id>` runs `was_execute` for that app. IDs are limited to letters, digits, `.`, `_` and `-`.
- Talks to the TV's own sdb port (`127.0.0.1:26101`), so Developer Mode's Host PC IP must be `127.0.0.1`, as TizenBrew itself requires.

Written for use with CleanFrame, but anything on the TV can call it. Anyone able to run a page or app on the TV can start installed apps through it, and nothing else.

## Use

In TizenBrew, add the module `gh/<user>/cleanframe-launcher` and start its service (or set it to autolaunch).
