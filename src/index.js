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

class Client {
  constructor() {
    this.sftp = undefined;
    this.debug = undefined;
    this.config = {};
    this._collector = "";
  }

  _collectData(data) {
    let logName = "_collectData";

    this.maybeDebug(`${logName}: Got ${data}`);
    if (data.match(/password: $/)) {
      this.maybeDebug(`${logName}: Got password prompt ${data}`);
      this.sftp.emit("password");
    } else if (data.match(/sftp> $/)) {
      this._collector += data;
      this.maybeDebug(`${logName}: Got prompt ${data}`);
      let newData = this._collector.split("\r");
      this._collector = "";
      this.maybeDebug(`${logName}: ${newData}`);
      this.sftp.emit("response", newData);
    } else {
      this._collector += data;
    }
  }

  maybeDebug(msg) {
    if (this.debug) {
      this.debug(msg);
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
          compress: config.compress ? true : false
        };
        if (config.privateKey) {
          if (config.privateKey instanceof Buffer) {
            return reject("privateKey must be a string path");
          }
          _self.config.privateKey = config.privateKey;
        }
        if (config.debug && typeof config.debug === "function") {
          _self.debug = config.debug;
        }

        _self.maybeDebug(`Config: ${JSON.stringify(config, null, " ")}`);

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

        _self.sftp = pty.spawn("sftp", args, {
          name: "sftp",
          cols: 80,
          rows: 30,
          cwd: __dirname,
          env: process.env
        });

        _self.sftp.on("error", err => {
          _self.maybeDebug(`Error Listener: ${err.message}`);
          throw err;
        });

        _self.sftp.on("exit", (code, signal) => {
          _self.maybeDebug(`exit event: code = ${code} signal: ${signal}`);
          if (code !== 0) {
            console.error(`sftp client existed with error code ${code}`);
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

        _self.sftp.on("response", r => {
          _self.maybeDebug(`response: resolving promise: ${r}`);
          _self.sftp.removeAllListeners("password");
          _self.sftp.removeAllListeners("response");
          resolve(true);
        });
      } catch (err) {
        _self.maybeDebug(`connect catch: ${err.message}`);
        reject(err.message);
      }
    });
  }

  end() {
    let _self = this;

    return new Promise((resolve, reject) => {
      try {
        if (_self.sftp) {
          _self.sftp.on("exit", (code, signal) => {
            resolve(`Exit code: ${code} Signal: ${signal}`);
            _self.sftp.destroy();
          });
          _self.sftp.write("exit\r");
          //_self.sftp.destroy();
        } else {
          resolve(true);
        }
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = Client;
