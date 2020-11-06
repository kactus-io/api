import { _handler } from '../../_handler'
import { createOrUpdateSubscription } from '../../stripe'
import { findOne, findOneByName, findOneOrg, addUserToOrg } from '../../storage'
import { BadRequest, Unauthorized, Forbidden, NotFound } from '../errors'

/**
 * githubId
 * memberUsername
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
          throw new Unauthorized(
            `Member ${body.memberUsername} is not registered on Kactus`
          )
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
  if (org.members.indexOf(member.githubId) !== -1) {
    throw new BadRequest(
      'Trying to add a member that is already part of the org'
    )
  }
  if (!org.stripeId || (!org.valid && !org.validEnterprise)) {
    throw new Forbidden('The organization is locked')
  }

  if (!org.prepaidFor) {
    // need to update the existing subscription
    const res = await createOrUpdateSubscription(
      {
        stripeId: org.stripeId,
        valid: org.valid,
        validEnterprise: org.validEnterprise,
      },
      {
        plan: org.validEnterprise ? 'enterprise' : 'premium',
        members: org.members.length + 1,
        triggerInvoice: true,
      }
    )

    if (!res.ok) {
      return {
        ok: false,
        org: org,
        paymentIntentSecret: res.paymentIntentSecret,
      }
    }
  }

  if (org.prepaidFor && org.prepaidFor === org.members.length) {
    throw new Forbidden(
      'You have reach the maximum number of members in your organisation. Please contact us.'
    )
  }

  await addUserToOrg(org, member)

  return {
    ok: true,
    memberId: member.githubId,
    message: 'Unlocked full access',
  }
})
