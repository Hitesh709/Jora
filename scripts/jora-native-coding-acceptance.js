#!/usr/bin/env node
import {spawn} from "node:child_process";
const child=spawn(process.execPath,["--test","test/jora-native-coding-acceptance.test.js"],{stdio:"inherit"});
child.on("exit",code=>process.exit(code??1));
