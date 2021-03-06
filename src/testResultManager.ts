// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from 'fs-extra';
import * as path from 'path';
import { Disposable, Uri, WorkspaceFolder } from 'vscode';
import { ITestResult, ITestResultDetails } from './runners/models';
import { getTestSourcePaths } from './utils/commandUtils';
import { isTestMethodName } from './utils/protocolUtils';

class TestResultManager implements Disposable {
    private testResultMap: Map<string, Map<string, ITestResultDetails>> = new Map<string, Map<string, ITestResultDetails>>();

    public async storeResult(workspaceFolder: WorkspaceFolder, ...results: ITestResult[]): Promise<void> {
        for (const result of results) {
            let uri: string | undefined;
            if (result.location && result.location.uri) {
                uri = result.location.uri;
            } else {
                uri = await this.resolveFsPathFromFullName(workspaceFolder, result.fullName);
            }
            if (!uri) {
                continue;
            }
            const fsPath: string = Uri.parse(uri).fsPath;
            if (!this.testResultMap.has(fsPath)) {
                this.testResultMap.set(fsPath, new Map<string, ITestResultDetails>());
            }
            this.testResultMap.get(fsPath)!.set(result.fullName, result.details);
        }
    }

    public getResultDetails(fsPath: string, testFullName: string): ITestResultDetails | undefined {
        const resultsInFsPath: Map<string, ITestResultDetails> | undefined = this.getResults(fsPath);
        if (resultsInFsPath) {
            return resultsInFsPath.get(testFullName);
        }
        return undefined;
    }

    public removeResultDetails(fsPath: string, testFullName: string): void {
        const resultsInFsPath: Map<string, ITestResultDetails> | undefined = this.getResults(fsPath);
        if (resultsInFsPath) {
            resultsInFsPath.delete(testFullName);
        }
    }

    public removeResultDetailsUnderTheClass(fsPath: string, testFullName: string): void {
        if (isTestMethodName(testFullName)) {
            return;
        }
        const resultsInFsPath: Map<string, ITestResultDetails> | undefined = this.getResults(fsPath);
        if (resultsInFsPath) {
            for (const key of resultsInFsPath.keys()) {
                if (key.startsWith(testFullName)) {
                    resultsInFsPath.delete(key);
                }
            }
        }
    }

    public getResults(fsPath: string): Map<string, ITestResultDetails> | undefined {
        return this.testResultMap.get(fsPath);
    }

    public dispose(): void {
        this.testResultMap.clear();
    }

    private async resolveFsPathFromFullName(workspaceFolder: WorkspaceFolder, fullName: string): Promise<string | undefined> {
        const classFullyQualifiedName: string = fullName.slice(0, fullName.indexOf('$') > -1 ? fullName.indexOf('$') : fullName.indexOf('#'));
        const relativePath: string = path.join(...classFullyQualifiedName.split('.'));
        const classPathEntries: string[] = await getTestSourcePaths([workspaceFolder.uri.toString()]);
        for (const classPathEntry of classPathEntries) {
            const possiblePath: string = `${path.join(Uri.file(classPathEntry).fsPath, relativePath)}.java`;
            if (await fse.pathExists(possiblePath)) {
                return Uri.file(possiblePath).toString();
            }
        }
        return undefined;
    }
}

export const testResultManager: TestResultManager = new TestResultManager();
