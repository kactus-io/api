import * as Stripe from 'stripe'
import { PLANS } from '../constants'
import { _handler } from '../_handler'
import { findOne, findOneOrg, update, updateOrg } from '../storage'

const stripe = new Stripe(process.env.STRIPE_SECRET)

function isSubscription(
  object: Stripe.IObject
): object is Stripe.subscriptions.ISubscription {
  return object.object === 'subscription'
}

function isInvoice(object: Stripe.IObject): object is Stripe.invoices.IInvoice {
  return object.object === 'invoice'
}

async function handleDeletedSubscription(
  subscription: Stripe.subscriptions.ISubscription
) {
  const customer = await stripe.customers.retrieve(
    subscription.customer as string
  )

  let updateBody: { validEnterprise?: boolean; valid?: boolean } = {}
  if (
    subscription.plan.id === PLANS.enterprise.month ||
    subscription.plan.id === PLANS.enterprise.year
  ) {
    updateBody.validEnterprise = false
  } else if (
    subscription.plan.id === PLANS.premium.month ||
    subscription.plan.id === PLANS.premium.year
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

async function handleCreatedSubscription(invoice: Stripe.invoices.IInvoice) {
  const subscription = await stripe.subscriptions.retrieve(
    invoice.subscription as string
  )

  const customer = await stripe.customers.retrieve(
    subscription.customer as string
  )

  let updateBody: { validEnterprise?: boolean; valid?: boolean } = {}
  if (
    subscription.plan.id === PLANS.enterprise.month ||
    subscription.plan.id === PLANS.enterprise.year
  ) {
    updateBody.valid = false
    updateBody.validEnterprise = true
  } else if (
    subscription.plan.id === PLANS.premium.month ||
    subscription.plan.id === PLANS.premium.year
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
