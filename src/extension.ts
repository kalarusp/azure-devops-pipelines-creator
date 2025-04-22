import * as vscode from 'vscode';
import * as nodeApi from 'azure-devops-node-api';
import * as fs from 'fs';
import { RemoteWithRefs, SimpleGit } from 'simple-git';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension "azure-devops-pipeline-creator" is now active!');

    let disposable = vscode.commands.registerCommand('extension.createAzureDevOpsPipelines', async () => {
        try {
            const gitPath = (vscode.workspace.workspaceFolders as vscode.WorkspaceFolder[])[0].uri.fsPath;
            const fsPath = (vscode.workspace.workspaceFolders as vscode.WorkspaceFolder[])[0].uri.fsPath + "\\.devops";
            
            const pat = process.env.AZURE_DEVOPS_PIPELINE_CREATOR_PAT as string;
            if (pat === undefined) {
                throw new Error(`Environment AZURE_DEVOPS_PIPELINE_CREATOR_PAT not found. Please add environment variable with valid personal access token with pipeline permissions.`);
            }

            const simpleGit = require('simple-git');
            const git: SimpleGit = simpleGit(gitPath);
            const remotes: RemoteWithRefs[] = await git.getRemotes(true);
            const remote = remotes.find(x => x.name === 'origin') as RemoteWithRefs;
            const remoteOriginUrl = remote.refs.push;
        
            const orgName = remoteOriginUrl.split('/')[3];
            const projectName = remoteOriginUrl.split('/')[4];;
            const repoName = remoteOriginUrl.split('/')[6];;
            
            const authHandler = nodeApi.getPersonalAccessTokenHandler(pat);
            const webApi = new nodeApi.WebApi(
                `https://dev.azure.com/${orgName}`,
                authHandler,
            );
            const gitApi = await webApi.getGitApi();
            const repository = await gitApi.getRepository(repoName, projectName);
            if (!repository?.id || !repository?.name) {
                throw new Error(`Repository ${repoName} not found`);
            }

            const url = `https://dev.azure.com/${orgName}/${projectName}/_apis/pipelines?api-version=7.1`;            

            if (fs.existsSync(fsPath)) {
                const yamlFiles = fs.readdirSync(fsPath).filter(file => file.endsWith('.yml'));

                for (const yamlFile of yamlFiles) {
                    const payload: CreatePipelinePostPayload = {
                        folder: null,
                        name: yamlFile.replace('.yml', ''),
                        configuration: {
                            type: 'yaml',
                            path: `/.devops/${yamlFile}`,
                            repository: {
                                id: repository.id,
                                name: repoName,
                                type: 'azureReposGit',
                            },
                        },
                    }

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                          Accept: 'application/json',
                          'Content-Type': 'application/json',
                          Authorization: `Basic ${Buffer.from(`PAT:${pat}`).toString('base64')}`,
                          'X-TFS-FedAuthRedirect': 'Suppress',
                        },
                        body: JSON.stringify(payload),
                      });
                      
                      if (!response.ok && response.status !== 409) {
                        throw new Error(`HTTP error! status: ${response.status.toString()})}`);
                      }

                      vscode.window.showInformationMessage(`Succesfully added pipelines.`);
                };
            }                        
        } catch (error) {
            vscode.window.showErrorMessage(`Error: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}

interface CreatePipelinePostPayload {
    configuration: {
      type: 'yaml';
      path: string;
      repository: {
        id: string;
        type: 'azureReposGit';
        name: string;
      };
    };
    folder: null | string;
    name: string;
}

export function deactivate() {}