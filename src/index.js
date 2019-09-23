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

const garbage = /No entry for terminal type "sftp";|using dumb terminal settings./;
const prompt = "sftp> ";
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

function makeCollector(sftp) {
  let buffer = "";
  let counter = 0;

  return function(data) {
    console.debug(`${counter}: ${data}`);
    counter += 1;
    if (data.match(pwd)) {
      sftp.emit("password");
    } else {
      buffer += data;
      if (buffer.match(RegExp(`^${prompt}$`, "m"))) {
        let newData = buffer
          .split("\r\n")
          .filter(l => !l.match(garbage))
          .filter(l => !l.match(RegExp(`^${prompt}`)))
          .filter(l => l.length && !l.match(/^ +$/));
        buffer = "";
        counter = 0;
        sftp.emit("response", newData);
      }
    }
  };
}

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
  }

  maybeDebug(msg) {
    if (this.debug) {
      this.debug(msg);
    }
  }

  write(s) {
    this.sftp.write(`${s}\r`);
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
    const self = this;
    let collector;

    return new Promise((resolve, reject) => {
      function connectCollector(data) {
        collector(data);
      }

      function connectResponse() {
        self.maybeDebug("resolving connect promise");
        self.sftp.removeAllListeners("password");
        self.sftp.removeListener("response", connectResponse);
        resolve(true);
      }

      try {
        self.config = {
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
          self.debug = config.debug;
        }

        //self.maybeDebug(`Config: ${JSON.stringify(self.config, null, " ")}`);

        let args = ["-q"];
        if (self.config.port !== 22) {
          args.push("-P");
          args.push(self.config.port);
        }
        if (self.config.forceIPv4) {
          args.push("-4");
        }
        if (self.config.forceIPv6) {
          args.push("-6");
        }
        if (self.config.compress) {
          args.push("-C");
        }
        if (self.config.privateKey) {
          args.push("-i");
          args.push(self.config.privateKey);
        }
        args.push(`${self.config.username}@${self.config.host}`);

        let sftpCmd = '"' + args.join(" ") + '"';
        console.log(`cmd: ${sftpCmd}`);

        self.sftp = pty.spawn("sftp", args, {
          name: "xterm-color",
          cols: 80,
          rows: 24,
          cwd: __dirname,
          env: process.env
        });

        collector = makeCollector(self.sftp);

        self.sftp.on("error", err => {
          throw new Error(err.message);
        });

        self.sftp.on("exit", (code, signal) => {
          if (code !== 0) {
            //console.error(`sftp client existed with error code ${code}`);
            throw new Error(
              `Existed with error code ${code} after signal ${signal}`
            );
          }
        });

        self.sftp.on("password", () => {
          self.maybeDebug("Send password");
          self.write(self.config.password);
        });

        self.sftp.on("response", connectResponse);
        self.sftp.on("data", connectCollector);
      } catch (err) {
        self.sftp.removeListener("response", connectResponse);
        self.sftp.removeAllListeners("password");
        reject(`connect: ${err.message}`);
      }
    });
  }

  /**
   * Closes the sftp connection
   *
   * @returns {Promise}
   */
  async end() {
    let self = this;

    try {
      if (self.sftp) {
        self.sftp.removeAllListeners("response");
        self.sftp.removeAllListeners("data");
        self.sftp.removeAllListeners("error");
        self.sftp.removeAllListeners("exit");
        self.write("exit");
        self.sftp.destroy();
        self.sftp = undefined;
      }
      return true;
    } catch (err) {
      throw new Error(`end: ${err.message}`);
    }
  }

  cwd() {
    const self = this;
    const cmd = "pwd";

    return new Promise((resolve, reject) => {
      function cwdResponse(res) {
        self.maybeDebug(`cwd response: ${JSON.stringify(res, null, " ")}`);
        res = res.filter(l => !l.match(RegExp(`\\w*${cmd}\\w*`)));
        let [r] = res.filter(l => l.match(/Remote working directory:/));
        let dir = r.match(/Remote working directory: (.*)/)[1];
        self.sftp.removeListener("response", cwdResponse);
        resolve(dir);
      }

      try {
        if (!self.sftp) {
          reject("No sftp connection");
        } else {
          self.sftp.on("response", cwdResponse);
          self.write(cmd);
        }
      } catch (err) {
        self.sftp.removeListener("response", cwdResponse);
        reject(`cwd: ${err.message}`);
      }
    });
  }

  _exists(remotePath) {
    const self = this;
    const notFound = /Can't ls: .* not found/;
    const {dir, base} = path.parse(remotePath);
    const cmd = `ls -l ${dir}`;

    return new Promise((resolve, reject) => {
      function existResponse(res) {
        self.maybeDebug(`exists response: ${JSON.stringify(res, null, " ")}`);
        res = res.filter(l => !l.match(RegExp("ls -l ")));
        let found = false;
        if (res.filter(l => l.match(notFound)).length) {
          found = false;
        } else {
          for (let l of res) {
            if (l.match(RegExp(`.*${base}$`))) {
              found = l.substring(0, 1);
            }
          }
          self.sftp.removeListener("response", existResponse);
          resolve(found);
        }
      }

      try {
        if (!self.sftp) {
          reject("No sftp connection");
        } else {
          self.sftp.on("response", existResponse);
          self.write(cmd);
        }
      } catch (err) {
        self.sftp.removeListener("response", existResponse);
        reject(`exists: ${err.message}`);
      }
    });
  }

  async exists(remotePath) {
    try {
      let absPath;
      if (!remotePath.startsWith("/")) {
        absPath = await this.realPath(remotePath);
      } else {
        absPath = remotePath;
      }
      let found = await this._exists(absPath);
      return found;
    } catch (err) {
      throw new Error(`exists: ${err.message}`);
    }
  }

  async realPath(remotePath) {
    const self = this;

    try {
      if (!self.sftp) {
        throw new Error("No sftp connection");
      } else if (remotePath.startsWith("/")) {
        let exists = await self._exists(remotePath);
        if (exists) {
          return remotePath;
        } else {
          throw new Error(`Path does not exist: ${remotePath}`);
        }
      } else {
        let pwd = await self.cwd();
        let absPath = path.join(pwd, remotePath);
        let exists = await self._exists(absPath);
        if (exists) {
          return absPath;
        } else {
          throw new Error(`Path does not exist: ${remotePath}`);
        }
      }
    } catch (err) {
      throw new Error(`realPath: ${err.message}`);
    }
  }

  /**
   * Returns an array of objects representing the output from ls -l on
   * remote server
   *
   * @param {string} remotePath - remote path
   * @returns {Promise} resolves to array of objects
   */
  list(remotePath) {
    const self = this;
    const notFound = /Can't ls: .* not found/;
    const cmd = `ls -l ${remotePath}`;

    return new Promise((resolve, reject) => {
      function listResponse(res) {
        self.maybeDebug(`list response: ${JSON.stringify(res, null, " ")}`);
        res = res.filter(l => !l.match(RegExp("\\w*ls -l ")));
        if (res.filter(l => l.match(notFound)).length) {
          self.sftp.removeListener("response", listResponse);
          reject(`${remotePath} not found`);
        } else {
          let listing = res.reduce((acc, v) => {
            let elements = v.split(/ +/);
            if (elements.length >= 9) {
              let mTime = makeTimestamp(elements[5], elements[6], elements[7]);
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
          self.sftp.removeListener("response", listResponse);
          resolve(listing);
        }
      }

      try {
        if (!self.sftp) {
          reject("No sftp connection");
        } else {
          self.sftp.on("response", listResponse);
          self.write(cmd);
        }
      } catch (err) {
        self.sftp.removeListener("response", listResponse);
        reject(err.message);
      }
    });
  }
}

module.exports = Client;
