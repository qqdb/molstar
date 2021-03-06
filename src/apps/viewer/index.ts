/**
 * Copyright (c) 2018-2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import '../../mol-util/polyfill';
import { createPlugin, DefaultPluginSpec } from '../../mol-plugin';
import './index.html';
import './embedded.html';
import './favicon.ico';
import { PluginContext } from '../../mol-plugin/context';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginSpec } from '../../mol-plugin/spec';
import { DownloadStructure, PdbDownloadProvider } from '../../mol-plugin-state/actions/structure';
import { PluginConfig } from '../../mol-plugin/config';
import { CellPack } from '../../extensions/cellpack';
import { RCSBAssemblySymmetry, RCSBValidationReport } from '../../extensions/rcsb';
import { PDBeStructureQualityReport } from '../../extensions/pdbe';
import { Asset } from '../../mol-util/assets';
import { ObjectKeys } from '../../mol-util/type-helpers';
import { PluginState } from '../../mol-plugin/state';
import { DownloadDensity } from '../../mol-plugin-state/actions/volume';
import { PluginLayoutControlsDisplay } from '../../mol-plugin/layout';
require('mol-plugin-ui/skin/light.scss');

const Extensions = {
    'cellpack': PluginSpec.Behavior(CellPack),
    'pdbe-structure-quality-report': PluginSpec.Behavior(PDBeStructureQualityReport),
    'rcsb-assembly-symmetry': PluginSpec.Behavior(RCSBAssemblySymmetry),
    'rcsb-validation-report': PluginSpec.Behavior(RCSBValidationReport)
};

const DefaultViewerOptions = {
    extensions: ObjectKeys(Extensions),
    layoutIsExpanded: true,
    layoutShowControls: true,
    layoutShowRemoteState: true,
    layoutControlsDisplay: 'reactive' as PluginLayoutControlsDisplay,
    layoutShowSequence: true,
    layoutShowLog: true,
    layoutShowLeftPanel: true,

    viewportShowExpand: PluginConfig.Viewport.ShowExpand.defaultValue,
    viewportShowSelectionMode: PluginConfig.Viewport.ShowSelectionMode.defaultValue,
    viewportShowAnimation: PluginConfig.Viewport.ShowAnimation.defaultValue,
    pluginStateServer: PluginConfig.State.DefaultServer.defaultValue,
    volumeStreamingServer: PluginConfig.VolumeStreaming.DefaultServer.defaultValue,
    pdbProvider: PluginConfig.Download.DefaultPdbProvider.defaultValue,
    emdbProvider: PluginConfig.Download.DefaultEmdbProvider.defaultValue,
};
type ViewerOptions = typeof DefaultViewerOptions;

export class Viewer {
    plugin: PluginContext

    constructor(elementId: string, options: Partial<ViewerOptions> = {}) {
        const o = { ...DefaultViewerOptions, ...options };

        const spec: PluginSpec = {
            actions: [...DefaultPluginSpec.actions],
            behaviors: [
                ...DefaultPluginSpec.behaviors,
                ...o.extensions.map(e => Extensions[e]),
            ],
            animations: [...DefaultPluginSpec.animations || []],
            customParamEditors: DefaultPluginSpec.customParamEditors,
            layout: {
                initial: {
                    isExpanded: o.layoutIsExpanded,
                    showControls: o.layoutShowControls,
                    controlsDisplay: o.layoutControlsDisplay,
                },
                controls: {
                    ...DefaultPluginSpec.layout && DefaultPluginSpec.layout.controls,
                    top: o.layoutShowSequence ? undefined : 'none',
                    bottom: o.layoutShowLog ? undefined : 'none',
                    left: o.layoutShowLeftPanel ? undefined : 'none',
                }
            },
            components: {
                ...DefaultPluginSpec.components,
                remoteState: o.layoutShowRemoteState ? 'default' : 'none',
            },
            config: DefaultPluginSpec.config
        };

        spec.config?.set(PluginConfig.Viewport.ShowExpand, o.viewportShowExpand);
        spec.config?.set(PluginConfig.Viewport.ShowSelectionMode, o.viewportShowSelectionMode);
        spec.config?.set(PluginConfig.Viewport.ShowAnimation, o.viewportShowAnimation);
        spec.config?.set(PluginConfig.State.DefaultServer, o.pluginStateServer);
        spec.config?.set(PluginConfig.State.CurrentServer, o.pluginStateServer);
        spec.config?.set(PluginConfig.VolumeStreaming.DefaultServer, o.volumeStreamingServer);
        spec.config?.set(PluginConfig.Download.DefaultPdbProvider, o.pdbProvider);
        spec.config?.set(PluginConfig.Download.DefaultEmdbProvider, o.emdbProvider);

        const element = document.getElementById(elementId);
        if (!element) throw new Error(`Could not get element with id '${elementId}'`);
        this.plugin = createPlugin(element, spec);
    }

    async setRemoteSnapshot(id: string) {
        const url = `${this.plugin.config.get(PluginConfig.State.CurrentServer)}/get/${id}`;
        await PluginCommands.State.Snapshots.Fetch(this.plugin, { url });
    }

    async loadSnapshotFromUrl(url: string, type: PluginState.SnapshotType) {
        await PluginCommands.State.Snapshots.OpenUrl(this.plugin, { url, type });
    }

    async loadStructureFromUrl(url: string, format = 'cif', isBinary = false) {
        const params = DownloadStructure.createDefaultParams(this.plugin.state.data.root.obj!, this.plugin);
        return this.plugin.runTask(this.plugin.state.data.applyAction(DownloadStructure, {
            source: {
                name: 'url',
                params: {
                    url: Asset.Url(url),
                    format: format as any,
                    isBinary,
                    options: params.source.params.options,
                }
            }
        }));
    }

    async loadPdb(pdb: string) {
        const params = DownloadStructure.createDefaultParams(this.plugin.state.data.root.obj!, this.plugin);
        const provider = this.plugin.config.get(PluginConfig.Download.DefaultPdbProvider)!;
        return this.plugin.runTask(this.plugin.state.data.applyAction(DownloadStructure, {
            source: {
                name: 'pdb' as const,
                params: {
                    provider: {
                        id: pdb,
                        server: {
                            name: provider,
                            params: PdbDownloadProvider[provider].defaultValue as any
                        }
                    },
                    options: params.source.params.options,
                }
            }
        }));
    }

    async loadPdbDev(pdbDev: string) {
        const params = DownloadStructure.createDefaultParams(this.plugin.state.data.root.obj!, this.plugin);
        return this.plugin.runTask(this.plugin.state.data.applyAction(DownloadStructure, {
            source: {
                name: 'pdb-dev' as const,
                params: {
                    id: pdbDev,
                    options: params.source.params.options,
                }
            }
        }));
    }

    async loadEmdb(emdb: string) {
        const provider = this.plugin.config.get(PluginConfig.Download.DefaultEmdbProvider)!;
        return this.plugin.runTask(this.plugin.state.data.applyAction(DownloadDensity, {
            source: {
                name: 'pdb-emd-ds' as const,
                params: {
                    provider: {
                        id: emdb,
                        server: provider,
                    },
                    detail: 3,
                }
            }
        }));
    }
}