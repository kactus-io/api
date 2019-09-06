import * as Stripe from 'stripe'
import { _handler } from '../../_handler'
import { updateSubscription } from './_createOrUpdateSubscription'
import {
  findOne,
  findOneByName,
  findOneOrg,
  removeUserFromOrg,
} from '../../storage'
import { BadRequest, Unauthorized, Forbidden, NotFound } from '../errors'

const stripe = new Stripe(process.env.STRIPE_SECRET)

/**
 * githubId
 * memberId
 * githubToken
 * orgId
 */
export const handler = _handler(async event => {
  let body = JSON.parse(event.body)

  if (!body.githubId) {
    throw new BadRequest('Missing github ID')
  }

  if (!body.orgId) {
    throw new BadRequest('Missing org ID')
  }

  if (!body.memberUsername) {
    throw new BadRequest('Missing member username')
  }

  if (!body.githubToken) {
    throw new BadRequest('Missing github token')
  }

  const [, member] = await Promise.all([
    findOne(body.githubId).then(found => {
      if (!found) {
        throw new Unauthorized('Not a Kactus account')
      }
      return found
    }),
    findOneByName(body.memberUsername)
      .then(found => {
        if (!found) {
          throw new Unauthorized('Member is not registered on Kactus')
        }
        return findOne(found.githubId)
      })
      .then(found => {
        if (!found) {
          throw new Unauthorized('Member is not registered on Kactus')
        }
        return found
      }),
  ])

  const org = await findOneOrg(body.orgId)

  if (!org) {
    throw new NotFound('Trying to unlock an org that does not exist')
  }
  if (org.admins.indexOf(body.githubId) === -1) {
    throw new NotFound('Trying to unlock an org that does not exist')
  }
  if (org.members.indexOf(member.githubId) === -1) {
    throw new BadRequest(
      'Trying to remove a member that is not part of the org'
    )
  }
  if (!org.stripeId || (!org.valid && !org.validEnterprise)) {
    throw new Forbidden('The organization is locked')
  }

  // need to update the existing subscription
  await updateSubscription(stripe, {
    org,
    fromPlan: org.validEnterprise ? 'enterprise' : 'premium',
    toPlan: org.validEnterprise ? 'enterprise' : 'premium',
    members: org.members.length - 1,
  })

  await removeUserFromOrg(org, member)

  return {
    ok: true,
    message: 'Removed full access',
  }
})
