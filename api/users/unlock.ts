import * as Stripe from 'stripe'
import cleanBody from './_cleanBody'
import { _handler } from '../../_handler'
import { findOne, update, create } from '../../storage'
import { BadRequest, Forbidden } from '../errors'
import { PLANS } from '../../constants'

const stripe = new Stripe(process.env.STRIPE_SECRET)

function createNewSubscription(
  body: { stripeId: string; enterprise: boolean },
  parsedBody: { coupon: string }
) {
  // create a new subscription
  return stripe.subscriptions.create({
    customer: body.stripeId,
    plan: body.enterprise ? PLANS.enterprise.month : PLANS.premium.month,
    coupon: parsedBody.coupon || undefined,
  })
}

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

  if (user.valid && body.enterprise) {
    // need to update the existing subscription
    const [monthlySubscriptions, yearlySubscriptions] = await Promise.all([
      stripe.subscriptions.list({
        customer: user.stripeId,
        plan: PLANS.premium.month,
        limit: 100,
      }),
      stripe.subscriptions.list({
        customer: user.stripeId,
        plan: PLANS.premium.year,
        limit: 100,
      }),
    ])

    const subscriptionToUpdate =
      monthlySubscriptions.data.find(s => s.status === 'active') ||
      yearlySubscriptions.data.find(s => s.status === 'active')
    if (!subscriptionToUpdate) {
      await createNewSubscription(
        { stripeId: user.stripeId, enterprise: body.enterprise },
        parsedBody
      )
    } else {
      await stripe.subscriptions.update(subscriptionToUpdate.id, {
        plan: PLANS.enterprise[parsedBody.duration || 'month'],
        coupon: parsedBody.coupon || undefined,
      })
    }
  } else {
    await createNewSubscription(
      { stripeId: user.stripeId, enterprise: body.enterprise },
      parsedBody
    )
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
