
# Table of Contents

1.  [sftp-wrapper-client](#org74c1918)


<a id="org74c1918"></a>

# sftp-wrapper-client

This is a very rough module designed primarily for testing purposes. It
attempts to replicate the API provided by the `ssh2-sftp-client`
module. However, as it is just a wrapper around the `sftp` command, it lacks the
fine grained integration and control of a native full JavaScript
implementation. 

Feel free to use this module, but be aware of the quite significant limitations
it has. In particular -

-   This module has only been tested on Linux and against linux sftp servers.
-   The interface is quite fragile - it relies on specific prompt and error
    message formats from the remote server.
-   Some of the returned values are not 100% compatible with the values returned
    by `ssh2-sftp-client`. In particular, the values for `modifyTime` and
    `lastAccess` in the output from `list()` are not accurate. They are derived
    from parsing of the output from `ls -l` and are the same for both values.

Despite the many weaknesses of this module, I have found it useful in a number
of situations and it assists in testing and comparing with `ssh2-sftp-client`,
which is a much more robust and reliable module. 

At this stage, I have no plans to extend the module to work on other
platforms. However, pull requests are always welcome. My only requirement is
that pull requests must include tests for the new functionality and the tests
must also pass when run on Linux. 

