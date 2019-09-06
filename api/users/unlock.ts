import * as Stripe from 'stripe'
import cleanBody from './_cleanBody'
import { _handler } from '../../_handler'
import { findOne, update, create } from '../../storage'
import { BadRequest, Forbidden } from '../errors'
import { createOrUpdateSubscription } from '../stripe-utils'

const stripe = new Stripe(process.env.STRIPE_SECRET)

export const handler = _handler(async event => {
  let parsedBody = JSON.parse(event.body || '{}')

  const body = cleanBody(parsedBody)
  if (!body.githubId) {
    throw new BadRequest('Missing github ID')
  }

  const token = parsedBody.token

  let user = await findOne(body.githubId)

  if (user) {
    if (!body.enterprise && (user.valid || user.validEnterprise)) {
      throw new Forbidden('Already unlocked')
    } else if (body.enterprise && user.validEnterprise) {
      throw new Forbidden('Already unlocked')
    }
  } else {
    user = await create(body)
  }

  if (user.stripeId) {
    await stripe.customers.update(user.stripeId, {
      email: body.email,
      source: token,
      metadata: {
        githubId: body.githubId,
        login: body.login,
        // @ts-ignore
        enterprise: body.enterprise,
      },
    })
  } else {
    const customer = await stripe.customers.create({
      email: user.email,
      source: token,
      metadata: Object.assign(parsedBody.metadata || {}, {
        githubId: user.githubId,
        login: user.login,
        enterprise: body.enterprise,
      }),
    })
    user = await update(user, { stripeId: customer.id })
  }

  const res = await createOrUpdateSubscription(
    {
      stripeId: user.stripeId,
      valid: user.valid,
      validEnterprise: user.validEnterprise,
    },
    {
      plan: body.enterprise ? 'enterprise' : 'premium',
      members: 1,
      coupon: parsedBody.coupon,
    }
  )

  if (!res.ok) {
    return {
      ok: false,
      paymentIntentSecret: res.paymentIntentSecret,
    }
  }

  user = await update(user, {
    validEnterprise: !!body.enterprise,
    valid: !body.enterprise,
  })

  return {
    ok: true,
    message: 'Unlocked full access',
  }
})
