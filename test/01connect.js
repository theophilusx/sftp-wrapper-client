"use strict";

// Test module connect/disconnect

const dotenvPath = __dirname + "/../.env";

require("dotenv").config({path: dotenvPath});

const chai = require("chai");
const expect = chai.expect;
const chaiSubset = require("chai-subset");
const chaiAsPromised = require("chai-as-promised");
const Client = require("../src/index.js");

chai.use(chaiSubset);
chai.use(chaiAsPromised);

describe("#connect() and #end() return a promise", function() {
  let config = {
    host: process.env.SFTP_SERVER,
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASSWORD
  };
  let client = new Client();

  it("connect() returns a promise", function() {
    return expect(client.connect(config)).to.be.a("promise");
  });

  it("end() returns a promise", function() {
    return expect(client.end()).to.be.a("promise");
  });
});
