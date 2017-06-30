module.exports = function cleanBody (body) {
  const res = {
    githubId: '' + body.githubId,
    enterprise: !!body.enterprise
  }
  if (body.email) {
    res.email = body.email
  }
  if (body.login) {
    res.login = body.login
  }
  return res
}
