"use strict";

// Test exists()

const dotenvPath = __dirname + "/../.env";

require("dotenv").config({path: dotenvPath});

const chai = require("chai");
const expect = chai.expect;
const chaiSubset = require("chai-subset");
const chaiAsPromised = require("chai-as-promised");
const Client = require("../src/index.js");

chai.use(chaiSubset);
chai.use(chaiAsPromised);

describe("#exists() tests", function() {
  let client;
  let config = {
    host: process.env.SFTP_SERVER,
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASSWORD,
    debug: s => {
      console.log(`DEBUG: ${s}`);
    }
  };

  before("exists() setup hook", async function() {
    client = new Client();
    await client.connect(config);
  });

  after("exists() cleanup hook", async function() {
    await client.end();
  });

  it("#exists() returns a promise", function() {
    return expect(client.exists()).to.be.a("promise");
  });

  it("#exists() returns true for existing dir", function() {
    return expect(client.exists("/home/tim/testServer")).to.eventually.equal(
      "d"
    );
  });

  it("#exists() returns false for non-existing object", function() {
    return expect(client.exists("/home/tim/not-exist")).to.eventually.equal(
      false
    );
  });
});
