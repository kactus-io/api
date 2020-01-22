### Secrets

Create 2 files called `config.dev.yml` and `config.production.yml` containing

```yml
GITHUB_CLIENT_ID: XXXXXXX
GITHUB_CLIENT_SECRET: XXXXXXX

STRIPE_SECRET: XXXXXX
STRIPE_ENDPOINT_SECRET: XXXXXX
```

### ORGS

1. user login with GitHub on the web
2. if already part of 1 org -> skip else if already part of multiple orgs if admin of 1 org -> show this one else show an org picker else pay with stripe -> create a valid org with the user as an admin
3. if the user is not the admin of the org -> only display the members without possibility to do anything else show a dashboard to add/promote/remove members and a button to pay again if the org is not valid anymore

Adding a member adds a subscription item Removing a member remove the subscription item
