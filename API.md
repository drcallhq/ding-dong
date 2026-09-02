# API

attention: using javascript promises

## Server options

```js
new AgiServer(handler, {
  port: 3000,          // default
  host: undefined,
  debug: false,
  logger: false,
  commandTimeout: 0,   // milliseconds; 0 disables the deadline
});
```

### commandTimeout

Deadline applied to every command dispatched on a context. When it expires the
command's promise **rejects** instead of staying pending. Forwarded to every
context the server creates, and overridable per call:

```js
context.sendCommand('GET VARIABLE TIME_END', {timeout: 5000});
```

⚠️ **It is `0` — disabled — by default, on purpose.** `dial`, `recordFile`,
`getData`, `waitForDigit` and `streamFile` block by design: an `EXEC Dial`
stays pending for the whole call. Any fixed default would eventually reject a
live one, so the value is yours to choose, above the longest blocking command
your handler issues. Leaving it unset means a command with no response stays
pending, which is the behaviour of every version before this one.

## Command failures

A command's promise rejects when the deadline above expires, or when Asterisk
answers with a line the response parser cannot read — most importantly
`511 Command Not Permitted on a dead channel`, which is the expected answer to
a channel read in the `h` extension.

The rejection names the command both in its message and in `err.command`:

```js
context.getVariable('TIME_END').catch(function(err) {
  err.command;   // 'GET VARIABLE TIME_END'
  err.message;   // 'AGI command failed: GET VARIABLE TIME_END — 511 ...'
});
```

An unreadable response still emits `hangup` afterwards, as it always did; the
difference is that the in-flight command is settled first, instead of being
abandoned with no rejection for a `.catch` to see.

### context.onEvent(event)

events

'variables' - on start call
'close' - on end session
'hangup' - on hangup channel


### context.answer()

### context.asyncagiBreak()

### context.channelStatus(channel)

### context.controlStreamFile(filename, escape_digits, skipms, ffchar, rewchr, pausechr, offsetms)
details https://wiki.asterisk.org/wiki/display/AST/Asterisk+13+AGICommand_control+stream+file

### context.databaseDel(variable, value)

### context.databaseDeltree(key)

### context.databaseGet

### context.databasePut

### context.exec

### context.getData

### context.getFullVariable

### context.getOption

### context.getVariable

### context.gosub

### context.hangup

### context.noop

### context.receiveChar

### context.receiveText

### context.recordFile

### context.sayAlpha

### context.sayDate

### context.sayDatetime

### context.sayDigits

### context.sayNumber

### context.sayPhonetic

### context.sayTime

### context.sendImage

### context.sendText

### context.setAutohangup

### context.setCallerid

### context.setContext

### context.setExtension

### context.setMusic

### context.setPriority

### context.setVariable

### context.speechActivateGrammar

### context.speechCreate

### context.speechDeactivateGrammar

### context.speechDestroy

### context.speechLoadGrammar

### context.speechRecognize

### context.speechSet

### context.speechUnloadGrammar

### context.streamFile

### context.tddMode

### context.verbose

### context.waitForDigit

### context.exec(command, [args])

Dispatches the `EXEC` AGI command to asterisk with supplied command name and arguments.

```js
context.exec('Dial', opt1, opt2, .., optN)
.then(function(result)
  //the channel call app Dial with options
});

context.exec('RecieveFax', '/tmp/myfax.tif')
.then(function(result) {
  //fax has been recieved by asterisk and written to /tmp/myfax.tif
});
```

### context.hangup()

Dispatches the 'HANGUP' AGI command to asterisk.  Does __not__ close the sockets automatically.  _callback_ is called with the result of the dispatch.

```js
context.hangup().
```
