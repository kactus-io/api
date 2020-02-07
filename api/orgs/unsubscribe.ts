import { _handler } from '../../_handler'
import { findOneOrg } from '../../storage'
import { BadRequest, NotFound, Forbidden } from '../errors'
import { cancel } from '../users/unsubscribe'

export const handler = _handler(async event => {
  let body = JSON.parse(event.body)

  if (!body.githubId) {
    throw new BadRequest('Missing github ID')
  }

  if (!body.orgId) {
    throw new BadRequest('Missing org ID')
  }

  const orgId = body.orgId

  const org = await findOneOrg(orgId)

  if (!org) {
    throw new NotFound('Trying to unsubscribe an org that does not exist')
  }
  if (org.admins.indexOf(body.githubId) === -1) {
    throw new NotFound('Trying to unsubscribe an org that does not exist')
  }
  if (!org.stripeId) {
    throw new Forbidden('Trying to unsubscribe an org that is not subscribed')
  }

  const refund = !!body.refound || !!body.refund // handle typo -_-'

  await cancel({ stripeId: org.stripeId }, refund)

  return {
    ok: true,
    message: 'Subscription canceled',
  }
})
