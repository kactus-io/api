import * as Stripe from 'stripe'
import { Org } from '../../storage'
import { PLANS } from '../../constants'

async function findSubscriptions(
  stripe: Stripe,
  org: Org,
  plan: 'premium' | 'enterprise'
) {
  const [monthlySubscriptions, yearlySubscriptions] = await Promise.all([
    stripe.subscriptions.list({
      customer: org.stripeId,
      plan: PLANS[plan || 'premium'].month,
      limit: 100,
    }),
    stripe.subscriptions.list({
      customer: org.stripeId,
      plan: PLANS[plan || 'premium'].year,
      limit: 100,
    }),
  ])
  return monthlySubscriptions.data.concat(yearlySubscriptions.data)
}

export function createNewSubscription(
  stripe: Stripe,
  {
    org,
    plan,
    coupon,
    members,
    duration,
  }: {
    org: Org
    plan: 'premium' | 'enterprise'
    coupon?: string
    members: number
    duration: 'month' | 'year'
  }
) {
  // create a new subscription
  return stripe.subscriptions.create({
    customer: org.stripeId,
    items: [
      {
        plan: PLANS[plan][duration || 'month'],
        quantity: members,
      },
    ],
    coupon: coupon || undefined,
  })
}

export async function updateSubscription(
  stripe: Stripe,
  {
    org,
    fromPlan,
    toPlan,
    coupon,
    members,
    duration,
    triggerInvoice,
  }: {
    org: Org
    fromPlan: 'premium' | 'enterprise'
    toPlan: 'premium' | 'enterprise'
    coupon?: string
    members: number
    duration?: 'month' | 'year'
    triggerInvoice?: boolean
  }
) {
  // need to update the existing subscription
  const existingSubscriptions = await findSubscriptions(stripe, org, fromPlan)
  const subscriptionToUpdate = existingSubscriptions.find(
    s => s.status === 'active'
  )
  if (!subscriptionToUpdate) {
    return createNewSubscription(stripe, {
      org,
      plan: toPlan,
      coupon,
      members,
      duration,
    })
  }
  if (toPlan !== fromPlan) {
    return stripe.subscriptions.update(subscriptionToUpdate.id, {
      items: [
        {
          plan: PLANS[toPlan || 'premium'][duration || 'month'],
          quantity: members,
        },
      ],
      coupon: coupon || undefined,
    })
  }
  stripe.subscriptionItems.update(subscriptionToUpdate.items.data[0].id, {
    quantity: members,
    prorate: true,
  })
  if (triggerInvoice) {
    return stripe.invoices
      .create({
        customer: org.stripeId,
        description: 'One-off invoice when adding a member',
      })
      .catch(() => {})
  }
}
