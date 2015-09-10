﻿
import http = require('http');
import cprocess = require('child_process')
import utils = require('../lib/utils');
import FileUtil = require('../lib/FileUtil');
import ServiceSocket = require('./ServiceSocket');

class Project {
    path: string;
    changes: egret.FileChanges;
    timer: NodeJS.Timer;
    buildProcess: cprocess.ChildProcess;
    _buildPort: ServiceSocket;
    pendingRequest: ServiceSocket;
    option: egret.ToolArgs;

    set buildPort(value: ServiceSocket) {
        if (this._buildPort) {
            this._buildPort.send({ command: "shutdown", path: this.path });
        }
        this._buildPort = value;
        this._buildPort.on('message', msg => this.onBuildServiceMessage(msg));
        setInterval(() => this._buildPort.send({}), 15000);
    }

    get buildPort() {
        return this._buildPort;
    }

    init() {

    }

    fileChanged(socket: ServiceSocket, task: egret.ServiceCommand, path?: string, changeType?: string) {
        if (this.pendingRequest)
            this.pendingRequest.end({ command: "build", exitCode: 0 });
        this.pendingRequest = socket;
        if (path && changeType) {
            this.initChanges();
            this.changes.push({
                fileName: path,
                type: changeType
            });
        }
        if (this.timer)
            clearTimeout(this.timer);
        this.timer = setTimeout(() => this.build(), 200);
    }

    build() {
        this.buildWithExistBuildService();
        this.changes = null;
    }

    buildWholeProject() {
        console.log('buildWholeProject');
        this.shutdown(11);
        var larkPath = FileUtil.joinPath(utils.getEgretRoot(), 'tools/bin/egret');

        var build = cprocess.spawn(process.execPath, ['--expose-gc', larkPath, 'compileservice', (this.option.sourceMap?"-sourcemap":"")], {
            detached: true,
            cwd: this.path
        });
        build.on('exit', (code, signal) => this.onBuildServiceExit(code, signal));

        this.buildProcess = build;
    }

    buildWithExistBuildService() {
        if (!egret.args.debug && !this.buildProcess) {
            this.buildWholeProject();
            return;
        }

        console.log("this.changes:", this.changes);

        this.sendCommand({
            command: "build",
            changes: this.changes,
            option: this.option
        });

        global.gc && global.gc();
    }

    private sendCommand(cmd: egret.ServiceCommand) {
        //this.buildProcess.stdin.write(JSON.stringify(cmd), 'utf8');
        this.buildPort && this.buildPort.send(cmd);
        //this.buildProcess.send(cmd);
    }

    public shutdown(retry = 0) {
        if (this.pendingRequest == null || retry >= 10) {
            this.sendCommand({
                command: 'shutdown',
                option: egret.args
            });
            if (this.buildProcess) {
                this.buildProcess.removeAllListeners('exit');
                this.buildProcess.kill();
                this.buildProcess = null;
            }
        }
        else {
            setTimeout(() => this.shutdown(retry++), 5000);
        }
    }

    onBuildServiceMessage(msg: egret.ServiceCommandResult) {
        if (this.pendingRequest) {
            this.pendingRequest.send(msg);
            this.pendingRequest = null;
        }
    }

    private onBuildServiceExit(code: number, signal:string) {
        console.log("Build service exit with", code, signal);
        this.buildProcess = null;
    }

    private showBuildWholeProject() {
        return false;
    }

    private initChanges() {
        if (this.changes)
            return;
        this.changes = []
    }
}

export = Project;

















/// <reference path="../lib/types.d.ts" />
