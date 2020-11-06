import { PLANS } from '../constants'
import { _handler } from '../_handler'
import { findOne, findOneOrg, update, updateOrg } from '../storage'
import { stripe, Stripe } from '../stripe'

function isSubscription(object: any): object is Stripe.Subscription {
  return object.object === 'subscription'
}

function isInvoice(object: any): object is Stripe.Invoice {
  return object.object === 'invoice'
}

async function handleDeletedSubscription(subscription: Stripe.Subscription) {
  const customer = await stripe.customers.retrieve(
    subscription.customer as string
  )

  if (!('metadata' in customer)) {
    return { message: 'deleted user' }
  }

  const plan = subscription.items.data[0].plan

  let updateBody: { validEnterprise?: boolean; valid?: boolean } = {}
  if (plan.id === PLANS.enterprise.month || plan.id === PLANS.enterprise.year) {
    updateBody.validEnterprise = false
  } else if (
    plan.id === PLANS.premium.month ||
    plan.id === PLANS.premium.year
  ) {
    updateBody.valid = false
  }

  if (customer.metadata.orgId) {
    const org = await findOneOrg(customer.metadata.orgId)
    if (!org) {
      return { message: 'nothing to do' }
    }
    await updateOrg(org, { ...updateBody, prepaidFor: 0 })
  } else {
    const user = await findOne(customer.metadata.githubId)
    if (!user) {
      return { message: 'nothing to do' }
    }
    await update(user, updateBody)
  }

  return { message: 'locked' }
}

async function handleCreatedSubscription(invoice: Stripe.Invoice) {
  const subscription = await stripe.subscriptions.retrieve(
    invoice.subscription as string
  )

  const customer = await stripe.customers.retrieve(
    subscription.customer as string
  )

  if (!('metadata' in customer)) {
    return { message: 'deleted user' }
  }

  const plan = subscription.items.data[0].plan

  let updateBody: { validEnterprise?: boolean; valid?: boolean } = {}
  if (plan.id === PLANS.enterprise.month || plan.id === PLANS.enterprise.year) {
    updateBody.valid = false
    updateBody.validEnterprise = true
  } else if (
    plan.id === PLANS.premium.month ||
    plan.id === PLANS.premium.year
  ) {
    updateBody.validEnterprise = false
    updateBody.valid = true
  }

  if (customer.metadata.orgId) {
    const org = await findOneOrg(customer.metadata.orgId)
    if (!org) {
      return { message: 'nothing to do' }
    }
    await updateOrg(org, updateBody)
  } else {
    const user = await findOne(customer.metadata.githubId)
    if (!user) {
      return { message: 'nothing to do' }
    }
    await update(user, updateBody)
  }

  return { message: 'unlocked' }
}

export const handler = _handler(async event => {
  let sig = event.headers['Stripe-Signature']

  const stripeEvent = stripe.webhooks.constructEvent(
    event.body,
    sig,
    process.env.STRIPE_ENDPOINT_SECRET
  )

  switch (stripeEvent.type) {
    case 'customer.subscription.deleted': {
      const subscription = stripeEvent.data.object
      if (isSubscription(subscription) && subscription.status !== 'active') {
        return await handleDeletedSubscription(subscription)
      }
    }
    case 'invoice.payment_succeeded': {
      const invoice = stripeEvent.data.object
      if (
        isInvoice(invoice) &&
        invoice.billing_reason === 'subscription_create'
      ) {
        return await handleCreatedSubscription(invoice)
      }
    }
    default:
      return {
        message: 'I am not handling that',
      }
  }
})
