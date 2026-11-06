// zod mirror of src/domain/LinkTypes.ts, NetworkState.ts and LabDocument.ts.
import { z } from 'zod'
import { LAB_SCHEMA_VERSION } from '../../domain'
import { deviceSchema } from './deviceSchemas'
import { idSchema } from './portSchemas'

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
  z.strictObject({ ...linkBaseShape, cable: z.literal('wireless'), ssid: z.string() }),
])

export const networkStateSchema = z.strictObject({
  devices: z.array(deviceSchema),
  links: z.array(linkSchema),
})

/** zod 4 numbers are finite; canvas coordinates may be negative. */
export const canvasPointSchema = z.strictObject({ x: z.number(), y: z.number() })

export const labViewportSchema = z.strictObject({ x: z.number(), y: z.number(), zoom: z.number().positive() })

export const labLayoutSchema = z.strictObject({
  devices: z.record(z.string(), canvasPointSchema),
  viewport: labViewportSchema.optional(),
})

export const annotationColorSchema = z.enum(['neutral', 'blue', 'green', 'amber', 'red', 'purple'])

const annotationBaseShape = { id: idSchema, color: annotationColorSchema }

export const textAnnotationSchema = z.strictObject({
  ...annotationBaseShape,
  type: z.literal('text'),
  at: canvasPointSchema,
  text: z.string(),
  size: z.enum(['small', 'medium', 'large']),
})

export const shapeAnnotationSchema = z.strictObject({
  ...annotationBaseShape,
  type: z.enum(['rectangle', 'ellipse']),
  at: canvasPointSchema,
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  label: z.string().optional(),
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
  title: z.string(),
  author: z.string().optional(),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const labDocumentSchema = z.strictObject({
  schemaVersion: z.literal(LAB_SCHEMA_VERSION),
  meta: labMetaSchema,
  state: networkStateSchema,
  layout: labLayoutSchema,
  notes: z.string(),
  annotations: z.array(annotationSchema),
})
