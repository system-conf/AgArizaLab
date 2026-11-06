import { expect, test } from './support/fixtures'

const ENGLISH_TITLE = 'A network lab in your browser'
const TURKISH_TITLE = 'Tarayıcında ağ laboratuvarı'

test.describe('landing', { tag: '@mobile' }, () => {
  test('renders in English', async ({ page }) => {
    await page.goto('/?lang=en')
    await expect(page.getByRole('heading', { level: 1, name: ENGLISH_TITLE })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('link', { name: 'Open the lab' })).toHaveAttribute('href', /\/lab/)
    await expect(page.getByRole('link', { name: 'Exercises', exact: true })).toBeVisible()
  })

  test('renders in Turkish', async ({ page }) => {
    await page.goto('/?lang=tr')
    await expect(page.getByRole('heading', { level: 1, name: TURKISH_TITLE })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
    await expect(page.getByRole('link', { name: 'Laboratuvarı aç' })).toBeVisible()
  })

  test('language switch persists across visits', async ({ page }) => {
    await page.goto('/?lang=en')
    await expect(page.getByRole('heading', { level: 1, name: ENGLISH_TITLE })).toBeVisible()

    await page.getByRole('combobox', { name: 'Language' }).selectOption('tr')
    await expect(page.getByRole('heading', { level: 1, name: TURKISH_TITLE })).toBeVisible()
    await expect(page).toHaveURL(/[?&]lang=tr/)

    // A later visit without ?lang= keeps the chosen language (browser locale is en-US).
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: TURKISH_TITLE })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Dil' })).toHaveValue('tr')
  })

  test('opens the lab and the exercise list', async ({ page }) => {
    await page.goto('/?lang=en')
    await page.getByRole('link', { name: 'Exercises', exact: true }).click()
    await expect(page).toHaveURL(/\/exercises(\?|$)/)
    await expect(page.getByRole('heading', { level: 1, name: 'Troubleshooting exercises' })).toBeVisible()

    await page.goto('/?lang=en')
    await page.getByRole('link', { name: 'Open the lab' }).click()
    await expect(page).toHaveURL(/\/lab(\?|$)/)
    await expect(page.getByRole('group', { name: 'Lab canvas' })).toBeVisible()
  })
})
