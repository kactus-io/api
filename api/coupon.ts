import * as Stripe from 'stripe'
import { _handler } from '../_handler'

const stripe = new Stripe(process.env.STRIPE_SECRET)

export const handler = _handler(async event => {
  const couponString = decodeURIComponent(event.pathParameters.coupon)
  const requestId = parseInt(event.queryStringParameters.requestId)

  try {
    const coupon = await stripe.coupons.retrieve(couponString)

    console.log(coupon)
    if (coupon && coupon.valid) {
      const discount =
        (coupon.amount_off
          ? coupon.amount_off + coupon.currency
          : coupon.percent_off + '%') +
        ' off' +
        (coupon.duration_in_months
          ? ' for ' +
            coupon.duration_in_months +
            ' month' +
            (coupon.duration_in_months > 1 ? 's' : '')
          : '')
      return {
        ok: true,
        percent_off: coupon.percent_off,
        amount_off: coupon.amount_off,
        currency: coupon.currency,
        duration_in_months: coupon.duration_in_months,
        discount: discount,
        requestId: requestId,
      }
    } else {
      return {
        ok: true,
        error: 'Coupon not valid anymore',
        requestId: requestId,
      }
    }
  } catch (err) {
    console.error(err)
    return {
      ok: true,
      error: 'Coupon not found',
      requestId: requestId,
    }
  }
})
