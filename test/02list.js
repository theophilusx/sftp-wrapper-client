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

describe("#list() method", function() {
  let config = {
    host: process.env.SFTP_SERVER,
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASSWORD,
    debug: s => {
      console.log(`DEBUG: ${s}`);
    }
  };
  let client;

  before("setup hook", async function() {
    client = new Client();
    await client.connect(config);
  });

  after("cleanup hook", async function() {
    await client.end();
  });

  it("#list() returns a promise", function() {
    return expect(client.list("/home/tim")).to.be.a("promise");
  });

  it("#list() resolves to an array", function() {
    return expect(
      client.list("/home/tim").then(l => {
        return l;
      })
    ).to.eventually.be.an("array");
  });

  it("#list() on non-existent directory rejected", function() {
    return expect(client.list("/home/tim/does-not-exist")).to.be.rejectedWith(
      /not found/
    );
  });
});
