// zod mirror of src/domain/LinkTypes.ts, NetworkState.ts and LabDocument.ts.
import { z } from 'zod'
import { LAB_SCHEMA_VERSION } from '../../domain'
import { deviceSchema } from './deviceSchemas'
import { LAB_LIMITS } from './labLimits'
import { idSchema, listOf, nameSchema, textSchema } from './portSchemas'

export const linkEndSchema = z.strictObject({ deviceId: idSchema, portId: idSchema })

const linkBaseShape = {
  id: idSchema,
  a: linkEndSchema,
  b: linkEndSchema,
  connected: z.boolean(),
}

export const linkSchema = z.discriminatedUnion('cable', [
  z.strictObject({ ...linkBaseShape, cable: z.enum(['copperStraight', 'copperCross', 'fiber', 'console', 'coaxial']) }),
  z.strictObject({ ...linkBaseShape, cable: z.literal('serial'), dceEnd: z.enum(['a', 'b']) }),
  z.strictObject({ ...linkBaseShape, cable: z.literal('wireless'), ssid: nameSchema }),
])

export const networkStateSchema = z.strictObject({
  devices: listOf(deviceSchema, LAB_LIMITS.devices),
  links: listOf(linkSchema, LAB_LIMITS.links),
})

/** zod 4 numbers are finite; canvas coordinates may be negative. */
export const canvasPointSchema = z.strictObject({ x: z.number(), y: z.number() })

export const labViewportSchema = z.strictObject({ x: z.number(), y: z.number(), zoom: z.number().positive() })

export const labLayoutSchema = z.strictObject({
  devices: z
    .record(idSchema, canvasPointSchema)
    .refine((devices) => Object.keys(devices).length <= LAB_LIMITS.devices, { params: { maximum: LAB_LIMITS.devices } }),
  viewport: labViewportSchema.optional(),
})

export const annotationColorSchema = z.enum(['neutral', 'blue', 'green', 'amber', 'red', 'purple'])

const annotationBaseShape = { id: idSchema, color: annotationColorSchema }

export const textAnnotationSchema = z.strictObject({
  ...annotationBaseShape,
  type: z.literal('text'),
  at: canvasPointSchema,
  text: textSchema,
  size: z.enum(['small', 'medium', 'large']),
})

export const shapeAnnotationSchema = z.strictObject({
  ...annotationBaseShape,
  type: z.enum(['rectangle', 'ellipse']),
  at: canvasPointSchema,
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  label: textSchema.optional(),
  filled: z.boolean(),
})

export const lineAnnotationSchema = z.strictObject({
  ...annotationBaseShape,
  type: z.literal('line'),
  from: canvasPointSchema,
  to: canvasPointSchema,
  arrow: z.boolean(),
})

export const annotationSchema = z.discriminatedUnion('type', [
  textAnnotationSchema,
  shapeAnnotationSchema,
  lineAnnotationSchema,
])

export const labMetaSchema = z.strictObject({
  title: nameSchema,
  author: nameSchema.optional(),
  description: textSchema.optional(),
  createdAt: nameSchema,
  updatedAt: nameSchema,
})

export const labDocumentSchema = z.strictObject({
  schemaVersion: z.literal(LAB_SCHEMA_VERSION),
  meta: labMetaSchema,
  state: networkStateSchema,
  layout: labLayoutSchema,
  notes: z.string().max(LAB_LIMITS.notesLength),
  annotations: listOf(annotationSchema, LAB_LIMITS.annotations),
})
