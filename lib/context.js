const EventEmitter = require('events').EventEmitter;
const state = require('./state');
const commands = require('./command');

// base context

const Context = function(conn, loggerOptions = {}) {
  EventEmitter.call(this);

  const consoleDecorator = function(arrow, data) {
    return console.log(arrow, JSON.stringify(data));
  };
  this.log = (loggerOptions.logger) ?
    loggerOptions.logger :
    consoleDecorator;


  this.debug = loggerOptions.debug;
  this.conn = conn;
  this.stream = conn;
  this.stream.setEncoding('utf8');
  this.state = state.init;

  this.msg = '';
  this.variables = {};
  this.pending = null;

  const self = this;
  this.stream.on('readable', function() {
    // always keep the 'leftover' part of the message
    self.msg = self.read();
  });

  this.stream.on('error', this.emit.bind(this, 'error'));
  this.stream.on('close', this.emit.bind(this, 'close'));
};

require('util').inherits(Context, EventEmitter);

Context.prototype.read = function() {
  const buffer = this.stream.read();
  if (!buffer) return this.msg;

  this.msg += buffer;

  if (this.state === state.init) {
    // we don't have whole message
    if (this.msg.indexOf('\n\n') < 0) return this.msg;
    this.readVariables(this.msg);
  } else if (this.state === state.waiting) {
    // we don't have whole message
    if (this.msg.indexOf('\n') < 0) return this.msg;
    this.readResponse(this.msg);
  }

  return '';
};

Context.prototype.readVariables = function(msg) {
  const lines = msg.split('\n');

  lines.map(function(line) {
    const split = line.split(':');
    const name = split[0];
    const value = split[1];
    this.variables[name] = (value || '').trim();
  }, this);

  this.emit('variables', this.variables);
  this.setState(state.waiting);
};

Context.prototype.readResponse = function(msg) {
  const lines = msg.split('\n');

  lines.map(function(line) {
    this.readResponseLine(line);
  }, this);
};

Context.prototype.readResponseLine = function(line) {
  if (!line) return;

  // var parsed = /^(\d{3})(?: result=)(.*)/.exec(line);
  const parsed = /^(\d{3})(?: result=)([^(]*)(?:\((.*)\))?/.exec(line);


  if (!parsed) {
    return this.emit('hangup');
  }

  const response = {
    code: parseInt(parsed[1]),
    result: parsed[2].trim(),
  };
  if (parsed[3]) {
    response.value = parsed[3];
  }

  // our last command had a pending callback
  if (this.pending) {
    const pending = this.pending;
    this.pending = null;
    pending(null, response);
  }
  this.emit('response', response);
};

Context.prototype.setState = function(state) {
  this.state = state;
};

Context.prototype.send = function(msg, cb) {
  this.pending = cb;
  this.stream.write(msg);
};

Context.prototype.close = function() {
  this.conn.destroy();
  this.stream.end();
  return Promise.resolve();
};

Context.prototype.sendCommand = function(command) {
  if (this.debug) this.log('------->', {command: command});
  const self = this;
  return new Promise(function(resolve, reject) {
    self.send(command + '\n', function(err, result) {
      if (self.debug) self.log('<-------', {err: err, result: result});
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

Context.prototype.onEvent = function(event) {
  const self = this;
  return new Promise(function(resolve) {
    self.on(event, function(data) {
      resolve(data);
    });
  });
};

// additional agi commands

commands.forEach(function(command) {
  let str = '';
  Context.prototype[command.name] = function(...args) {
    if (command.params > 0) {
      // const args = [].slice.call(arguments, 0, command.params);
      str = command.command + ' ' +
        prepareArgs(args, command.paramRules, command.params).join(' ');
    } else {
      str = command.command;
    }
    return this.sendCommand(str);
  };
});

const prepareArgs = function(args, argsRules, count) {
  if (!argsRules || !count) {
    return args;
  }

  return (new Array(count)).fill(null)
      .map(function(arg, i) {
        arg = args[i] !== undefined && args[i] !== null ?
            args[i] :
            argsRules[i] && argsRules[i].default || '';
        const prepare = argsRules[i] && argsRules[i].prepare ||
          function(x) {
            return x;
          };

        return prepare(String(arg));
      });
};

// manual implementations (override dynamic ones for better flexibility)

Context.prototype.exec = function() {
  const args = Array.prototype.slice.call(arguments, 0);
  return this.sendCommand('EXEC ' + args.join(' '));
};

Context.prototype.databaseDel = function(family, key) {
  return this.sendCommand('DATABASE DEL ' + family + ' ' + key);
};

Context.prototype.databaseDelTree = function(family, keytree) {
  return this.sendCommand('DATABASE DELTREE ' + family + ' ' + keytree);
};

Context.prototype.databaseGet = function(family, key) {
  return this.sendCommand('DATABASE GET ' + family + ' ' + key);
};

Context.prototype.databasePut = function(family, key, value) {
  return this.sendCommand('DATABASE PUT ' + family + ' ' + key + ' ' + value);
};

Context.prototype.speechCreate = function(engine) {
  return this.sendCommand('SPEECH CREATE ' + engine);
};

Context.prototype.speechDestroy = function() {
  return this.sendCommand('SPEECH DESTROY');
};

Context.prototype.speechActivateGrammar = function(name) {
  return this.sendCommand('SPEECH ACTIVATE GRAMMAR ' + name);
};

Context.prototype.speechDeactivateGrammar = function(name) {
  return this.sendCommand('SPEECH DEACTIVATE GRAMMAR ' + name);
};

Context.prototype.speechLoadGrammar = function(name, path) {
  return this.sendCommand('SPEECH LOAD GRAMMAR ' + name + ' ' + path);
};

Context.prototype.speechUnloadGrammar = function(name) {
  return this.sendCommand('SPEECH UNLOAD GRAMMAR ' + name);
};

Context.prototype.speechSet = function(name, value) {
  return this.sendCommand('SPEECH SET ' + name + ' ' + value);
};

Context.prototype.speechRecognize = function(prompt, timeout, offset) {
  return this.sendCommand('SPEECH RECOGNIZE ' + prompt + ' ' + timeout + ' ' + offset);
};

Context.prototype.getVariable = function(name) {
  return this.sendCommand('GET VARIABLE ' + name);
};

Context.prototype.getFullVariable = function(variable, channel) {
  return this.sendCommand('GET FULL VARIABLE ' + variable + ' ' + channel);
};

Context.prototype.getData = function(file, timeout, maxdigits) {
  return this.sendCommand('GET DATA ' + file + ' ' + timeout + ' ' + maxdigits);
};

Context.prototype.getOption = function(file, escape_digits, timeout) {
  return this.sendCommand('GET OPTION ' + file + ' "' + escape_digits + '" ' + timeout);
};

Context.prototype.receiveChar = function(timeout) {
  return this.sendCommand('RECEIVE CHAR ' + timeout);
};

Context.prototype.receiveText = function(timeout) {
  return this.sendCommand('RECEIVE TEXT ' + timeout);
};

Context.prototype.setAutoHangup = function(seconds) {
  return this.sendCommand('SET AUTOHANGUP ' + seconds);
};

Context.prototype.setCallerID = function(number) {
  return this.sendCommand('SET CALLERID ' + number);
};

Context.prototype.setContext = function(context) {
  return this.sendCommand('SET CONTEXT ' + context);
};

Context.prototype.setExtension = function(extension) {
  return this.sendCommand('SET EXTENSION ' + extension);
};

Context.prototype.setPriority = function(priority) {
  return this.sendCommand('SET PRIORITY ' + priority);
};

Context.prototype.setMusic = function(musicclass) {
  return this.sendCommand('SET MUSIC ' + musicclass);
};

Context.prototype.setVariable = function(name, value) {
  return this.sendCommand('SET VARIABLE ' + name + ' "' + value + '"');
};

Context.prototype.sendImage = function(image) {
  return this.sendCommand('SEND IMAGE ' + image);
};

Context.prototype.sendText = function(text) {
  return this.sendCommand('SEND TEXT "' + text + '"');
};

Context.prototype.channelStatus = function(name) {
  return this.sendCommand('CHANNEL STATUS ' + name);
};

Context.prototype.answer = function() {
  return this.sendCommand('ANSWER');
};

Context.prototype.verbose = function(message, level) {
  return this.sendCommand('VERBOSE "' + message + '" ' + level);
};

Context.prototype.tddMode = function(value) {
  return this.sendCommand('TDD MODE ' + value);
};

Context.prototype.noop = function(cb) {
  return this.sendCommand('NOOP');
};

Context.prototype.gosub = function(context, extension, priority, option) {
  const str = [context, extension, priority, option].join(' ');
  return this.sendCommand('GOSUB ' + str);
};

Context.prototype.recordFile = function(filename, format, escape_digits, timeout, offset, beep, silence) {
  const str = [
    '"' + filename + '"',
    format,
    escape_digits,
    parseInt(timeout) * 1000,
    offset,
    beep,
    silence,
  ].join(' ');
  return this.sendCommand('RECORD FILE ' + str);
};

Context.prototype.sayNumber = function(number, escape_digits) {
  return this.sendCommand('SAY NUMBER ' + number + ' "' + escape_digits + '"');
};

Context.prototype.sayAlpha = function(number, escape_digits) {
  return this.sendCommand('SAY ALPHA ' + number + ' "' + escape_digits + '"');
};

Context.prototype.sayDate = function(seconds, escape_digits) { // seconds since 1.01.1970
  return this.sendCommand('SAY DATE ' + seconds + ' "' + escape_digits + '"');
};

Context.prototype.sayTime = function(seconds, escape_digits) { // seconds since 1.01.1970
  return this.sendCommand('SAY TIME ' + seconds + ' "' + escape_digits + '"');
};

Context.prototype.sayDateTime = function(seconds, escape_digits, format, timezone) { // seconds since 1.01.1970
  return this.sendCommand('SAY DATETIME ' + seconds + ' "' + escape_digits + '" ' + format + ' ' + timezone);
};

Context.prototype.sayDigits = function(digits, escape_digits) {
  return this.sendCommand('SAY DIGITS ' + digits + ' "' + escape_digits + '"');
};

Context.prototype.sayPhonetic = function(string, escape_digits) {
  return this.sendCommand('SAY PHONETIC ' + string + ' "' + escape_digits + '"');
};

Context.prototype.streamFile = function(filename, digits) {
  const acceptDigits = digits ? digits : '1234567890#*';
  return this.sendCommand('STREAM FILE "' + filename + '" "' + acceptDigits + '"');
};

Context.prototype.waitForDigit = function(timeoutIn) {
  const timeout = timeoutIn ? timeoutIn : 5000;
  return this.sendCommand('WAIT FOR DIGIT ' + timeout);
};

Context.prototype.hangup = function() {
  return this.sendCommand('HANGUP');
};

Context.prototype.asyncAGIBreak = function() {
  return this.sendCommand('ASYNCAGI BREAK');
};

// sugar commands

Context.prototype.dial = function(num, timeout, params) {
  return this.exec('Dial', num + ',' + timeout + ',' + params);
};

module.exports = Context;
