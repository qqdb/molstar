/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { VolumeData } from '../data'
import { Task } from 'mol-task';
import { SpacegroupCell, Box3D } from 'mol-math/geometry';
import { Tensor, Vec3 } from 'mol-math/linear-algebra';
import { Ccp4File } from 'mol-io/reader/ccp4/schema';
import { degToRad } from 'mol-math/misc';

function volumeFromCcp4(source: Ccp4File, params?: { voxelSize?: Vec3 }): Task<VolumeData> {
    return Task.create<VolumeData>('Parse Volume Data', async ctx => {
        const { header, values } = source;
        const size = Vec3.create(header.xLength, header.yLength, header.zLength)
        if (params && params.voxelSize) Vec3.mul(size, size, params.voxelSize)
        const angles = Vec3.create(degToRad(header.alpha), degToRad(header.beta), degToRad(header.gamma))
        const cell = SpacegroupCell.create(header.ISPG || 'P 1', size, angles);

        const axis_order_fast_to_slow = Vec3.create(header.MAPC - 1, header.MAPR - 1, header.MAPS - 1);
        const normalizeOrder = Tensor.convertToCanonicalAxisIndicesFastToSlow(axis_order_fast_to_slow);

        const grid = [header.NX, header.NY, header.NZ];
        const extent = normalizeOrder([header.NC, header.NR, header.NS]);

        let gridOrigin: number[]
        if (header.originX === 0.0 && header.originY === 0.0 && header.originZ === 0.0) {
            gridOrigin = normalizeOrder([header.NCSTART, header.NRSTART, header.NSSTART]);
        } else {
            // When available (e.g. in MRC files) use ORIGIN records instead of N[CRS]START
            gridOrigin = [header.originX, header.originY, header.originZ];
        }

        const origin_frac = Vec3.create(gridOrigin[0] / grid[0], gridOrigin[1] / grid[1], gridOrigin[2] / grid[2]);
        const dimensions_frac = Vec3.create(extent[0] / grid[0], extent[1] / grid[1], extent[2] / grid[2]);

        const space = Tensor.Space(extent, Tensor.invertAxisOrder(axis_order_fast_to_slow), header.MODE === 0 ? Int8Array : Float32Array);
        const data = Tensor.create(space, Tensor.Data1(values));

        // TODO Calculate stats? When to trust header data?
        // Min/max/mean are reliable (based on LiteMol/DensityServer usage)
        // These, however, calculate sigma, so no data on that.

        return {
            cell,
            fractionalBox: Box3D.create(origin_frac, Vec3.add(Vec3.zero(), origin_frac, dimensions_frac)),
            data,
            dataStats: {
                min: header.AMIN,
                max: header.AMAX,
                mean: header.AMEAN,
                sigma: header.ARMS
            }
        };
    });
}

export { volumeFromCcp4 }