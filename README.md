# 4minit - Mauritius News in 4 Minutes

**4minit** is a free daily newsletter covering Mauritius, regional developments, and global headlines, designed to be read in 4 minutes. 4minit is fully automated, requiring minimal manual intervention.

* [Read online](https://4minit.xyz)
* [Subscribe for free](https://4minit.xyz/#subscribe)

4minit is an independent hobby project focused on tackling a simple problem I face everyday, so I built a fully automated solution and made it free for everyone!

## Why I started this project?

I started this project with the goal of getting local news efficiently, in English.

I don't have the time to scour dozens of sites, doomscroll on Facebook pages, or translate hundreds of articles from Kreol or French (being a native English speaker). That's why I created 4minit. Now, I can get the most important and relevant news updates in my inbox every morning - perfect for a quick read during my morning routine, my commute or even during my morning coffee break at the office.

## How does 4minit cut through the noise?

1. News aggregation, filtration and clustering are handled upstream by the [Mauritius News Aggregator](https://github.com/scjtools/mauritius-news-aggregator)
2. "Newsworthiness" selection step (powered by AI) distills the upstream feed down into a shortlist of articles (based on a bunch of my preset preferences, interests etc.)
3. Selected articles are reviewed and summarised into our newsletters, which are then published online (powered by Vercel) and delivered to subscribers (powered by Brevo) - every morning.

The entire setup is fully automated and runs on its own. I do have some ocassional manual intervention - typically bug fixes, error handling, UI/UX upgrades, LLM token optimisation etc.
