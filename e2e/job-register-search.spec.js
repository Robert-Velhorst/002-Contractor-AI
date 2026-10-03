const { test, expect } = require('@playwright/test')

test('operator can find an older job by title in the job register', async ({ page, request }) => {
  const uniqueTitle = `Searchable register job oldest ${Date.now()}`
  async function addJob(title) {
    return request.post('/api/ledger/intake', {
      data: {
        title,
        service: 'Roof maintenance',
        address: 'Keizersgracht 10',
        city: 'Amsterdam',
        client: { name: `Job Register Client ${title}`, email: `${title.replaceAll(' ', '-')}@example.test` },
      },
    })
  }
  const intake = await addJob(uniqueTitle)
  expect(intake.ok()).toBeTruthy()
  for (let index = 0; index < 100; index += 1) {
    const newerJob = await addJob(`Searchable register job newer ${index}`)
    expect(newerJob.ok()).toBeTruthy()
  }

  await page.goto('/')
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB')
  await page.getByRole('button', { name: 'Jobs', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'All jobs' })).toBeVisible()
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert')
  await expect(page.getByRole('row').filter({ hasText: uniqueTitle })).toHaveCount(0)
  const searchBox = page.getByRole('searchbox', { name: 'Search jobs' })
  await searchBox.fill('Searchable register job')
  await expect(searchBox).toHaveValue('Searchable register job')
  const [searchResponse] = await Promise.all([
    page.waitForResponse(response => (
      response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/ledger/jobs'
    )),
    page.getByRole('button', { name: 'Search jobs' }).click(),
  ])
  expect(searchResponse.ok()).toBeTruthy()
  expect(new URL(searchResponse.url()).searchParams.get('search')).toBe('Searchable register job')

  const row = page.getByRole('row').filter({ hasText: uniqueTitle })
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(row).toBeVisible()
  await expect(page.getByRole('status').last()).toContainText('Search page 2: 1 results.')
  await page.getByLabel('Language').selectOption('nl-NL')
  await expect(page.getByRole('heading', { name: 'Alle opdrachten' })).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Opdrachten zoeken' })).toBeVisible()
  await expect(page.getByRole('status').last()).toContainText('Zoekresultaten op pagina 2: 1.')
})
