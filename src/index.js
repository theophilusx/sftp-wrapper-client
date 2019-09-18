"use strict";

// simple wrapper around sftp

// This module is designed as a drop-in replacement for the ssh2-sftp-client
// module. It has been created mainly for testing and diagnostic purposes.
// However, it should be noted that because of limitation associated with using
// a spawned external program, some features cannot be implemented and others
// will have different behaviour. For example, you don't have the same
// fine-grained control over signals and error handling as you do with a full
// native implementaiton of sftp. Likewise, some configuration options provided
// by ssh2-sftp-client are missing or slightly different (see below).

const pty = require("node-pty");
const moment = require("moment");
const path = require("path");

const garbage = /No entry for terminal type "sftp";|using dumb terminal settings./gi;
const prompt = /^sftp> $/m;
const pwd = /password: $/m;
const months = {
  Jan: 1,
  Fed: 2,
  Mar: 3,
  Apr: 4,
  May: 5,
  Jun: 6,
  Jul: 7,
  Aug: 8,
  Sep: 9,
  Oct: 10,
  Nov: 11,
  Dec: 12
};

function makeTimestamp(month, day, timeOrYear) {
  try {
    let year = moment().format("YYYY");
    let time = `${timeOrYear}:00`;
    if (timeOrYear.indexOf(":") === -1) {
      // timeOrYear is year
      year = timeOrYear;
      time = "00:00:00";
    } else if (parseInt(moment().format("MM") < months[month])) {
      year = parseInt(moment().format("YYYY")) - 1;
    }
    if (parseInt(months[month]) < 10) {
      month = `0${months[month]}`;
    } else {
      month = months[month];
    }
    if (parseInt(day) < 10) {
      day = `0${day}`;
    }
    return moment(`${year}-${month}-${day}T${time}Z`);
  } catch (err) {
    throw new Error(`makeTimestamp: ${err.message}`);
  }
}

class Client {
  constructor() {
    this.sftp = undefined;
    this.debug = undefined;
    this.config = {};
    this._collector = "";
  }

  maybeDebug(msg) {
    if (this.debug) {
      this.debug(msg);
    }
  }

  _collectData(data) {
    let name = "collectData";

    // this.maybeDebug(`${logName}: Got ${data}`);
    if (data.match(pwd)) {
      this.maybeDebug(`${name}: found password prompt - emitting`);
      this.sftp.emit("password");
    } else {
      this._collector += data;
      if (this._collector.match(prompt)) {
        let newData = this._collector
          .replace(garbage, "")
          .replace(/sftp>/, "")
          .split("\r\n")
          .filter(l => l.length && !l.match(/^ +$/) && !l.match(/^sftp> /));
        this._collector = "";
        this.maybeDebug(
          `${name}: returning ${JSON.stringify(newData, null, " ")}`
        );
        this.sftp.emit("response", newData);
      }
    }
  }

  // let commonOpts = {
  //   host: 'localhost', // string Hostname or IP of server.
  //   port: 22, // Port number of the server.
  //   forceIPv4: false, // boolean (optional) Only connect via IPv4 address
  //   forceIPv6: false, // boolean (optional) Only connect via IPv6
  //                        address
  //   username: 'donald', // string Username for authentication.
  //   password: 'borsch', // string Password for password-based user
  //                          authentication
  //   agent: process.env.SSH_AGENT, // ignored.
  //   privateKey: fs.readFileSync('/path/to/key'), // support path only
  //   passphrase: 'a pass phrase', // ignored
  //   readyTimeout: 20000, // ignored
  //   strictVendor: true // ignored
  //   debug: myDebug // function - Set this to a function that receives a
  //                     singlestring argument to get detailed (local)
  //                     debug information.
  //   retries: 2 // ignored
  //   retry_factor: 2 // ignored
  //   retry_minTimeout: 2000 // ignored
  // };

  /**
   * Open an sftp connection to remote server
   *
   * @param {object} config - config values
   * @returns {Promise}
   */
  connect(config) {
    let _self = this;

    return new Promise((resolve, reject) => {
      try {
        _self.config = {
          host: config.host,
          port: config.port || 22,
          forceIPv4: config.forceIPv4 ? true : false,
          forceIPv6: config.forceIPv6 ? true : false,
          username: config.username,
          password: config.password,
          compress: config.compress ? true : false,
          privateKey: config.privateKey ? config.privateKey : undefined
        };

        if (config.debug && typeof config.debug === "function") {
          _self.debug = config.debug;
        }

        _self.maybeDebug(`Config: ${JSON.stringify(_self.config, null, " ")}`);

        let args = ["-q"];
        if (_self.config.port !== 22) {
          args.push("-P");
          args.push(_self.config.port);
        }
        if (_self.config.forceIPv4) {
          args.push("-4");
        }
        if (_self.config.forceIPv6) {
          args.push("-6");
        }
        if (_self.config.compress) {
          args.push("-C");
        }
        if (_self.config.privateKey) {
          args.push("-i");
          args.push(_self.config.privateKey);
        }
        args.push(`${_self.config.username}@${_self.config.host}`);

        _self.maybeDebug(`Args: ${JSON.stringify(args)}`);

        _self.sftp = pty.spawn("/usr/bin/sftp", args, {
          name: "sftp",
          cols: 80,
          rows: 30,
          cwd: __dirname,
          env: process.env
        });

        _self.sftp.on("error", err => {
          throw new Error(err.message);
        });

        _self.sftp.on("exit", (code, signal) => {
          if (code !== 0) {
            //console.error(`sftp client existed with error code ${code}`);
            throw new Error(
              `Existed with error code ${code} after signal ${signal}`
            );
          }
        });

        _self.sftp.on("data", data => {
          _self._collectData(data);
        });

        _self.sftp.on("password", () => {
          _self.maybeDebug("Send password");
          _self.sftp.write(`${_self.config.password}\r`);
        });

        _self.sftp.on("response", () => {
          _self.maybeDebug("resolving connect promise");
          _self.sftp.removeAllListeners("password");
          _self.sftp.removeAllListeners("response");
          resolve(true);
        });
      } catch (err) {
        _self.sftp.removeAllListeners("response");
        _self.sftp.removeAllListeners("password");
        reject(err.message);
      }
    });
  }

  /**
   * Closes the sftp connection
   *
   * @returns {Promise}
   */
  end() {
    let _self = this;

    return new Promise((resolve, reject) => {
      try {
        if (_self.sftp) {
          _self.sftp.removeAllListeners("data");
          _self.sftp.removeAllListeners("error");
          _self.sftp.removeAllListeners("exit");
          _self.sftp.write("exit \r");
          _self.sftp.destroy();
          _self.sftp = undefined;
        }
        resolve(true);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Returns an array of objects representing the output from ls -l on
   * remote server
   *
   * @param {string} remotePath - remote path
   * @returns {Promise} resolves to array of objects
   */
  list(remotePath) {
    const _self = this;
    const notFound = /Can't ls: .* not found/;

    return new Promise((resolve, reject) => {
      try {
        let cmd = `ls -l ${remotePath}`;
        if (!_self.sftp) {
          reject("No sftp connection");
        } else {
          _self.sftp.on("response", res => {
            res = res.filter(l => !l.match(RegExp(`\\w*${cmd}\\w*`)));
            _self.maybeDebug(
              `list response: ${JSON.stringify(res, null, " ")}`
            );
            if (res.filter(l => l.match(notFound)).length) {
              reject(`${path} not found`);
            } else {
              let listing = res.reduce((acc, v) => {
                let elements = v.split(/ +/);
                if (elements.length >= 9) {
                  let mTime = makeTimestamp(
                    elements[5],
                    elements[6],
                    elements[7]
                  );
                  let entry = {
                    type: elements[0].substring(0, 1),
                    rights: {
                      user: elements[0].substring(1, 4).replace(/-/gi, ""),
                      group: elements[0].substring(4, 7).replace(/-/gi, ""),
                      other: elements[0].substring(7).replace(/-/gi, "")
                    },
                    owner: elements[2],
                    group: elements[3],
                    size: elements[4],
                    modifyTime: mTime,
                    accessTime: mTime,
                    name: elements.slice(8).join(" ")
                  };
                  acc.push(entry);
                }
                return acc;
              }, []);
              _self.sftp.removeAllListeners("response");
              resolve(listing);
            }
          });
          _self.sftp.write(`${cmd}\r`);
        }
      } catch (err) {
        _self.sftp.removeAllListeners("response");
        reject(err.message);
      }
    });
  }

  cwd() {
    let _self = this;

    return new Promise((resolve, reject) => {
      try {
        let cmd = "pwd";
        if (!_self.sftp) {
          reject("No sftp connection");
        } else {
          _self.sftp.on("response", res => {
            res = res.filter(l => !l.match(RegExp(`\\w*${cmd}\\w*`)));
            _self.maybeDebug(`cwd response: ${JSON.stringify(res, null, " ")}`);
            let [r] = res.filter(l => l.match(/Remote working directory:/));
            let dir = r.match(/Remote working directory: (.*)/)[1];
            _self.sftp.removeAllListeners("response");
            resolve(dir);
          });
          _self.sftp.write("pwd\r");
        }
      } catch (err) {
        _self.sftp.removeAllListeners("response");
        reject(err.message);
      }
    });
  }

  exists(remotePath) {
    const _self = this;
    const notFound = /Can't ls: .* not found/;

    return new Promise((resolve, reject) => {
      try {
        let {dir, base} = path.parse(remotePath);
        let cmd = `ls -l ${dir}`;
        if (!_self.sftp) {
          reject("No sftp connection");
        } else {
          _self.sftp.on("response", res => {
            res = res.filter(l => !l.match(RegExp(`\\w*${cmd}\\w*`)));
            if (res.filter(l => l.match(notFound)).length) {
              _self.sftp.removeAllListeners("response");
              return resolve(false);
            }
            for (let l of res) {
              if (l.match(RegExp(`\\.*${base}$`))) {
                _self.sftp.removeAllListeners("response");
                return resolve(l.substring(0, 1));
              }
            }
            _self.sftp.removeAllListeners("response");
            return resolve(false);
          });
          _self.sftp.write(`${cmd}\r`);
        }
      } catch (err) {
        _self.sftp.removeAllListeners("response");
        reject(err.message);
      }
    });
  }
}

module.exports = Client;
