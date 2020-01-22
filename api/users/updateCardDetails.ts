import * as Stripe from 'stripe'
import { _handler } from '../../_handler'
import { findOne } from '../../storage'
import { BadRequest, NotFound } from '../errors'

const stripe = new Stripe(process.env.STRIPE_SECRET)

/**
 * githubId
 * token
 */
export const handler = _handler(async event => {
  let body = JSON.parse(event.body)

  if (!body.githubId) {
    throw new BadRequest('Missing github ID')
  }

  if (!body.token) {
    throw new BadRequest('Missing token')
  }

  const token = body.token

  let user = await findOne(body.githubId)

  if (!user) {
    throw new NotFound('Trying to unlock a user that does not exist')
  }

  if (!user.stripeId) {
    throw new BadRequest('Missing Stripe Id')
  }

  await stripe.customers.update(user.stripeId, {
    email: body.email,
    source: token,
    metadata: Object.assign(body.metadata || {}, {
      githubId: body.githubId,
    }),
  })

  return {
    ok: true,
    message: 'Updated card details',
  }
})
