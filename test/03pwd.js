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

describe("#pwd() tests", function() {
  let client;
  let config = {
    host: process.env.SFTP_SERVER,
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASSWORD,
    debug: s => {
      console.log(`DEBUG: ${s}`);
    }
  };

  before("cwd() setup hook", async function() {
    client = new Client();
    await client.connect(config);
  });

  after("cwd() cleanup hook", async function() {
    await client.end();
  });

  it("#cwd() returns a promise", function() {
    return expect(client.cwd()).to.be.a("promise");
  });

  it("#cwd() returns base working dir", function() {
    return expect(client.cwd()).to.eventually.equal("/home/tim");
  });
});
