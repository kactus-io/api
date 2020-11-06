import { _handler } from '../../_handler'
import { createOrUpdateSubscription, stripe } from '../../stripe'
import {
  findOne,
  findOneOrg,
  updateOrg,
  Org,
  createOrg,
  addUserToOrg,
} from '../../storage'
import { BadRequest, Unauthorized, Forbidden, NotFound } from '../errors'
import { cancel } from '../users/unsubscribe'
import * as uuid from 'uuid/v4'

async function createOrUpdateStripeCustomer(
  org: Org,
  body: { email: string; metadata?: any; githubId: string; login: string },
  token: string
) {
  if (org.stripeId) {
    await stripe.customers.update(org.stripeId, {
      email: body.email,
      source: token,
      metadata: Object.assign(body.metadata || {}, {
        githubId: body.githubId,
        login: body.login,
        org: true,
        orgId: org.id,
      }),
    })
    return org
  } else {
    const customer = await stripe.customers.create({
      email: body.email,
      source: token,
      metadata: Object.assign(body.metadata || {}, {
        githubId: body.githubId,
        login: body.login,
        org: true,
        orgId: org.id,
      }),
    })

    console.log(customer)
    return await updateOrg(org, { stripeId: customer.id })
  }
}

/**
 * githubId
 * token
 * orgId
 * enterprise
 */
export const handler = _handler(async event => {
  let body = JSON.parse(event.body)

  if (!body.githubId) {
    throw new BadRequest('Missing github ID')
  }

  if (!body.token) {
    throw new BadRequest('Missing token')
    return
  }

  const token = body.token
  let orgId = body.orgId

  let org: Org

  const user = await findOne(body.githubId)

  if (!user) {
    throw new Unauthorized('Not a Kactus account')
  }

  if (!orgId) {
    // if we don't have a orgId, it means that we want to create one
    org = await createOrg({
      id: uuid(),
      members: [],
      admins: [String(body.githubId)],
    })
    // if the user already has a subscription, cancel it first
    if (user.stripeId && (user.valid || user.validEnterprise)) {
      await cancel({ stripeId: user.stripeId }, false)
    }

    org = await addUserToOrg(org, user)
  } else {
    const potentialOrg = await findOneOrg(orgId)

    if (!potentialOrg) {
      throw new NotFound('Trying to unlock an org that does not exist')
    }
    if (potentialOrg.admins.indexOf(body.githubId) === -1) {
      throw new NotFound('Trying to unlock an org that does not exist')
    }

    if (
      !body.enterprise &&
      (potentialOrg.valid || potentialOrg.validEnterprise)
    ) {
      throw new Forbidden('Already unlocked')
    }
    if (body.enterprise && potentialOrg.validEnterprise) {
      throw new Forbidden('Already unlocked')
    }

    org = potentialOrg
  }

  org = await createOrUpdateStripeCustomer(org, body, token)

  const res = await createOrUpdateSubscription(
    {
      stripeId: org.stripeId,
      valid: org.valid,
      validEnterprise: org.validEnterprise,
    },
    {
      plan: body.enterprise ? 'enterprise' : 'premium',
      members: org.members.length,
      coupon: body.coupon,
      duration: body.duration,
    }
  )

  if (!res.ok) {
    return {
      ok: false,
      org: org,
      paymentIntentSecret: res.paymentIntentSecret,
    }
  }

  org = await updateOrg(org, {
    validEnterprise: body.enterprise,
    valid: !body.enterprise,
  })

  return {
    ok: true,
    org: org,
    message: 'Unlocked full access',
  }
})
