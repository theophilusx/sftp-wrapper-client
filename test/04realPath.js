"use strict";

// Test realPath() method

const dotenvPath = __dirname + "/../.env";

require("dotenv").config({path: dotenvPath});

const chai = require("chai");
const expect = chai.expect;
const chaiSubset = require("chai-subset");
const chaiAsPromised = require("chai-as-promised");
const Client = require("../src/index.js");

chai.use(chaiSubset);
chai.use(chaiAsPromised);

describe("#realPath() method", function() {
  let config = {
    host: process.env.SFTP_SERVER,
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASSWORD
    // debug: s => {
    //   console.log(`DEBUG: ${s}`);
    // }
  };
  let client;

  before("realpath() setup hook", async function() {
    client = new Client();
    await client.connect(config);
  });

  after("realpath() cleanup hook", async function() {
    await client.end();
  });

  it("#realPath() returns a promise", function() {
    return expect(client.realPath("/home/tim")).to.be.a("promise");
  });

  it("#realPath() absolute path resolves to path", function() {
    return expect(client.realPath("/home/tim/testServer")).to.eventually.equal(
      "/home/tim/testServer"
    );
  });

  it("#realPath() on non-existent object rejected", function() {
    return expect(
      client.realPath("/home/tim/testServer/does-not-exist")
    ).to.be.rejectedWith(/Path does not exist/);
  });
});
