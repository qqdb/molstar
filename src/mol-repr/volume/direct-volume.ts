/**
 * Copyright (c) 2018 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { VolumeData } from 'mol-model/volume'
import { RuntimeContext } from 'mol-task'
import { VolumeVisual, VolumeRepresentation } from './index';
import { createDirectVolumeRenderObject } from 'mol-gl/render-object';
import { Loci, EmptyLoci } from 'mol-model/loci';
import { paramDefaultValues } from 'mol-util/parameter';
import { Vec3, Mat4 } from 'mol-math/linear-algebra';
import { Box3D } from 'mol-math/geometry';
import { WebGLContext } from 'mol-gl/webgl/context';
import { createTexture } from 'mol-gl/webgl/texture';
import { LocationIterator } from 'mol-geo/util/location-iterator';
import { createIdentityTransform } from 'mol-geo/geometry/transform-data';
import { DirectVolume } from 'mol-geo/geometry/direct-volume/direct-volume';
import { Geometry, createRenderableState } from 'mol-geo/geometry/geometry';
import { PickingId } from 'mol-geo/geometry/picking';
import { MarkerAction } from 'mol-geo/geometry/marker-data';
import { VisualUpdateState } from 'mol-repr/util';
import { VisualContext, RepresentationContext } from 'mol-repr';

function getBoundingBox(gridDimension: Vec3, transform: Mat4) {
    const bbox = Box3D.empty()
    Box3D.add(bbox, gridDimension)
    Box3D.transform(bbox, bbox, transform)
    return bbox
}

// 2d volume texture

function getVolumeTexture2dLayout(dim: Vec3, maxTextureSize: number) {
    let width = 0
    let height = dim[1]
    let rows = 1
    let columns = dim[0]
    if (maxTextureSize < dim[0] * dim[2]) {
        columns =  Math.floor(maxTextureSize / dim[0])
        rows = Math.ceil(dim[2] / columns)
        width = columns * dim[0]
        height *= rows
    } else {
        width = dim[0] * dim[2]
    }
    width += columns // horizontal padding
    height += rows // vertical padding
    return { width, height, columns, rows }
}

function createVolumeTexture2d(volume: VolumeData, maxTextureSize: number) {
    const { data: tensor, dataStats: stats } = volume
    const { space, data } = tensor
    const dim = space.dimensions as Vec3
    const { get } = space
    const { width, height, columns, rows } = getVolumeTexture2dLayout(dim, maxTextureSize)

    const array = new Uint8Array(width * height * 4)
    const textureImage = { array, width, height }

    const [ xl, yl, zl ] = dim
    const xlp = xl + 1 // horizontal padding
    const ylp = yl + 1 // vertical padding

    function setTex(value: number, x: number, y: number, z: number) {
        const column = Math.floor(((z * xlp) % width) / xlp)
        const row = Math.floor((z * xlp) / width)
        const px = column * xlp + x
        const index = 4 * ((row * ylp * width) + (y * width) + px)
        array[index + 3] = ((value - stats.min) / (stats.max - stats.min)) * 255
    }

    console.log('dim', dim)
    console.log('layout', { width, height, columns, rows })

    for (let z = 0; z < zl; ++z) {
        for (let y = 0; y < yl; ++y) {
            for (let x = 0; x < xl; ++x) {
                setTex(get(data, x, y, z), x, y, z)
            }
        }
    }

    return textureImage
}

export function createDirectVolume2d(ctx: RuntimeContext, webgl: WebGLContext, volume: VolumeData, directVolume?: DirectVolume) {
    const gridDimension = volume.data.space.dimensions as Vec3
    const textureImage = createVolumeTexture2d(volume, webgl.maxTextureSize)
    // debugTexture(createImageData(textureImage.array, textureImage.width, textureImage.height), 1/3)
    const transform = VolumeData.getGridToCartesianTransform(volume)
    const bbox = getBoundingBox(gridDimension, transform)
    const dim = Vec3.create(gridDimension[0], gridDimension[1], gridDimension[2])
    dim[0] += 1 // horizontal padding
    dim[0] += 1 // vertical padding

    const texture = directVolume ? directVolume.gridTexture.ref.value : createTexture(webgl, 'image-uint8', 'rgba', 'ubyte', 'linear')
    texture.load(textureImage)

    return DirectVolume.create(bbox, dim, transform, texture, directVolume)
}

// 3d volume texture

function createVolumeTexture3d(volume: VolumeData) {
    const { data: tensor, dataStats: stats } = volume
    const { space, data } = tensor
    const [ width, height, depth ] = space.dimensions as Vec3
    const { get } = space

    const array = new Uint8Array(width * height * depth * 4)
    const textureVolume = { array, width, height, depth }

    console.log('stats', stats)

    let i = 0
    for (let z = 0; z < depth; ++z) {
        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                if (i < 100) {
                    console.log(get(data, x, y, z), ((get(data, x, y, z) - stats.min) / (stats.max - stats.min)) * 255)
                }
                array[i + 3] = ((get(data, x, y, z) - stats.min) / (stats.max - stats.min)) * 255
                // array[i + 3] = ((get(data, x, z, y) - stats.min) / (stats.max - stats.min)) * 255
                // array[i + 3] = ((get(data, y, x, z) - stats.min) / (stats.max - stats.min)) * 255
                // array[i + 3] = ((get(data, y, z, x) - stats.min) / (stats.max - stats.min)) * 255
                // array[i + 3] = ((get(data, z, y, x) - stats.min) / (stats.max - stats.min)) * 255
                // array[i + 3] = ((get(data, z, x, y) - stats.min) / (stats.max - stats.min)) * 255
                i += 4
            }
        }
    }

    // let i = 0
    // for (let z = 0; z < depth; ++z) {
    //     for (let x = 0; x < width; ++x) {
    //         for (let y = 0; y < height; ++y) {
    //             array[i + 3] = ((get(data, x, y, z) - stats.min) / (stats.max - stats.min)) * 255
    //             i += 4
    //         }
    //     }
    // }

    // let i = 0
    // for (let x = 0; x < width; ++x) {
    //     for (let y = 0; y < height; ++y) {
    //         for (let z = 0; z < depth; ++z) {
    //             array[i + 3] = ((get(data, x, y, z) - stats.min) / (stats.max - stats.min)) * 255
    //             i += 4
    //         }
    //     }
    // }

    return textureVolume
}

export function createDirectVolume3d(ctx: RuntimeContext, webgl: WebGLContext, volume: VolumeData, directVolume?: DirectVolume) {
    const gridDimension = volume.data.space.dimensions as Vec3
    const textureVolume = createVolumeTexture3d(volume)
    const transform = VolumeData.getGridToCartesianTransform(volume)
    // Mat4.invert(transform, transform)
    const bbox = getBoundingBox(gridDimension, transform)

    const texture = directVolume ? directVolume.gridTexture.ref.value : createTexture(webgl, 'volume-uint8', 'rgba', 'ubyte', 'linear')
    texture.load(textureVolume)

    return DirectVolume.create(bbox, gridDimension, transform, texture, directVolume)
}

//

export async function createDirectVolume(ctx: VisualContext, volume: VolumeData, props: DirectVolumeProps, directVolume?: DirectVolume) {
    const { runtime, webgl } = ctx
    if (webgl === undefined) throw new Error('DirectVolumeVisual requires `webgl` in props')

    return webgl.isWebGL2 ?
        await createDirectVolume3d(runtime, webgl, volume, directVolume) :
        await createDirectVolume2d(runtime, webgl, volume, directVolume)
}


//

export const DirectVolumeParams = {
    ...Geometry.Params,
    ...DirectVolume.Params
}
export const DefaultDirectVolumeProps = paramDefaultValues(DirectVolumeParams)
export type DirectVolumeProps = typeof DefaultDirectVolumeProps

export function DirectVolumeVisual(): VolumeVisual<DirectVolumeProps> {
    return VolumeVisual<DirectVolumeProps>({
        defaultProps: DefaultDirectVolumeProps,
        createGeometry: createDirectVolume,
        getLoci: () => EmptyLoci,
        mark: () => false,
        setUpdateState: (state: VisualUpdateState, newProps: DirectVolumeProps, currentProps: DirectVolumeProps) => {
        },
        createRenderObject: async (ctx: VisualContext, geometry: DirectVolume, locationIt: LocationIterator, props: DirectVolumeProps) => {
            const transform = createIdentityTransform()
            const values = await DirectVolume.createValues(ctx.runtime, geometry, transform, locationIt, props)
            const state = createRenderableState(props)
            return createDirectVolumeRenderObject(values, state)
        },
        updateValues: DirectVolume.updateValues
    })
}

export function DirectVolumeRepresentation(): VolumeRepresentation<DirectVolumeProps> {
    let currentProps: DirectVolumeProps
    const volumeRepr = VolumeRepresentation(DirectVolumeVisual)
    return {
        label: 'Direct Volume',
        params: DirectVolumeParams,
        get renderObjects() {
            return [ ...volumeRepr.renderObjects ]
        },
        get props() {
            return { ...volumeRepr.props }
        },
        createOrUpdate: (ctx: RepresentationContext, props: Partial<DirectVolumeProps> = {}, volume?: VolumeData) => {
            currentProps = Object.assign({}, DefaultDirectVolumeProps, currentProps, props)
            return volumeRepr.createOrUpdate(ctx, currentProps, volume)
        },
        getLoci: (pickingId: PickingId) => {
            return volumeRepr.getLoci(pickingId)
        },
        mark: (loci: Loci, action: MarkerAction) => {
            return volumeRepr.mark(loci, action)
        },
        destroy() {
            volumeRepr.destroy()
        }
    }
}