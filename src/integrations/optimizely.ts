import {ToggleIdType} from '../types'
import {booleanToggle as baseBooleanToggle} from '../core/booleanToggle'
import {toggle as baseToggle} from '../core/toggle'
import {NOTIFICATION_TYPES} from '@optimizely/optimizely-sdk/lib/utils/enums'

import OptimizelyLib from '@optimizely/optimizely-sdk'
import type {Client} from '@optimizely/optimizely-sdk'

type UserIdType = string
type AudienceSegmentationAttributeKeyType = string
type AudienceSegmentationAttributeValueType = string | boolean

type AudienceSegmentationAttributesType = {
  [key in AudienceSegmentationAttributeKeyType]?: AudienceSegmentationAttributeValueType
}

type BooleanToggleValueType = boolean
type ExperimentToggleValueType = string
type ToggleValueType = ExperimentToggleValueType | BooleanToggleValueType

export type OptimizelyDatafileType = any

export {NOTIFICATION_TYPES}

let Optimizely: typeof OptimizelyLib // reference to injected Optimizely library
let optimizelyClient: Client // reference to active Optimizely instance
let userId: UserIdType
let audienceSegmentationAttributes: AudienceSegmentationAttributesType = {}

type FeatureEnabledCacheType = {[key in ToggleIdType]?: BooleanToggleValueType}
type ExperimentCacheType = {[key in ToggleIdType]?: ExperimentToggleValueType}
type CacheType = ExperimentCacheType | FeatureEnabledCacheType
type ForcedTogglesType = {[key in ToggleIdType]?: ToggleValueType}

let featureEnabledCache: FeatureEnabledCacheType = {}
let experimentCache: ExperimentCacheType = {}
const forcedToggles: ForcedTogglesType = {}

export const registerLibrary = (lib: typeof OptimizelyLib) => {
  // TODO: Double-check if this works with server environments
  // Since they load the module in memory, make sure they are not persisted
  // across different requests
  Optimizely = lib
}

const clearFeatureEnabledCache = () => (featureEnabledCache = {})
const clearExperimentCache = () => (experimentCache = {})

// Adds / removes Toggles to force from the forcedToggles list
export const forceToggles = (
  toggleKeyValues: {[key in ToggleIdType]?: ToggleValueType | null}
) => {
  Object.keys(toggleKeyValues).forEach((toggleId) => {
    const value = toggleKeyValues[toggleId]

    if (value === null) {
      delete forcedToggles[toggleId]
    } else {
      forcedToggles[toggleId] = value
    }
  })
}

const invalidateCaches = () => {
  clearFeatureEnabledCache()
  clearExperimentCache()
}

export const setUserId = (id: UserIdType) => {
  invalidateCaches()
  userId = id
}

export const setAudienceSegmentationAttributes = (
  attributes: AudienceSegmentationAttributesType = {}
) => {
  invalidateCaches()
  audienceSegmentationAttributes = {
    ...audienceSegmentationAttributes,
    ...attributes
  }
}

export const resetAudienceSegmentationAttributes = () => {
  invalidateCaches()
  audienceSegmentationAttributes = {}
}

type ActivateEventHandlerType = () => void
type EventDispatcherType = {dispatchEvent: () => void}
type EventListenerType = () => void

const voidActivateHandler = () => null
const voidEventDispatcher = {
  dispatchEvent: () => null
}

export const initialize = (
  datafile: OptimizelyDatafileType,
  onExperimentDecision: ActivateEventHandlerType = voidActivateHandler,
  eventDispatcher: EventDispatcherType = voidEventDispatcher
) => {
  optimizelyClient = Optimizely.createInstance({
    datafile,
    eventDispatcher
  })

  addActivateListener(onExperimentDecision)
}

export const addActivateListener = (listener: EventListenerType) =>
  optimizelyClient.notificationCenter.addNotificationListener(
    NOTIFICATION_TYPES.ACTIVATE,
    listener
  )

const isForcedOrCached = (toggleId: ToggleIdType, cache: CacheType): boolean =>
  forcedToggles.hasOwnProperty(toggleId) || cache.hasOwnProperty(toggleId)

const getForcedOrCached = (
  toggleId: ToggleIdType,
  cache: CacheType
): ToggleValueType | null | undefined => {
  const register = forcedToggles.hasOwnProperty(toggleId)
    ? forcedToggles
    : cache

  return register[toggleId]
}

const validateUserId = (id: UserIdType) => {
  if (!id) throw new Error('Opticks: Fatal error: user id is not set')
}

const getOrSetCachedFeatureEnabled = (
  toggleId: ToggleIdType
): BooleanToggleValueType => {
  validateUserId(userId)

  const DEFAULT = false

  if (isForcedOrCached(toggleId, featureEnabledCache)) {
    const value = getForcedOrCached(toggleId, featureEnabledCache)
    return typeof value === 'boolean' ? value : DEFAULT
  }

  return (featureEnabledCache[toggleId] = optimizelyClient.isFeatureEnabled(
    toggleId,
    userId,
    audienceSegmentationAttributes
  ))
}

const getBooleanToggle = getOrSetCachedFeatureEnabled

export const booleanToggle = baseBooleanToggle(getBooleanToggle)

const getToggle = (toggleId: ToggleIdType): ExperimentToggleValueType => {
  validateUserId(userId)

  const DEFAULT = 'a'

  if (isForcedOrCached(toggleId, experimentCache)) {
    const value = getForcedOrCached(toggleId, experimentCache)
    return typeof value === 'string' ? value : DEFAULT
  }

  // Assuming the variation keys follow a, b, c, etc. convention
  // TODO: Enforce ^ ?
  return (experimentCache[toggleId] =
    optimizelyClient.activate(
      toggleId,
      userId,
      audienceSegmentationAttributes
    ) || DEFAULT)
}

export const toggle = baseToggle(getToggle)