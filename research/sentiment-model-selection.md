# Sentiment-scoring approach for the Python Sentiment Service

Research ticket: [danzgne/crypto-strategy-lab#8](https://github.com/danzgne/crypto-strategy-lab/issues/8) (part of #1)

**Question:** for a stateless FastAPI service that takes crypto news text and returns a
POSITIVE/NEUTRAL/NEGATIVE label + numeric score, with a 2-week build window, no GPU, no
fine-tuning budget, and a 4-person student team — is a lexicon-based scorer (VADER) or a
small pretrained HuggingFace transformer checkpoint the better fit?

Candidates evaluated: `vaderSentiment` (lexicon/rule-based), `distilbert-base-uncased-finetuned-sst-2-english`
(generic English sentiment, the `transformers` default), `cardiffnlp/twitter-roberta-base-sentiment-latest`
(social-media-tuned RoBERTa), `ProsusAI/finbert` (finance-domain BERT).

---

## 1. VADER (`vaderSentiment`)

- **What it is:** a lexicon-and-rule-based sentiment tool — no neural network, no training step. It
  scores text via a hand-built valence dictionary plus grammatical heuristics (negation, punctuation
  emphasis, intensifiers, capitalization). Source: [PyPI project page](https://pypi.org/project/vaderSentiment/)
  and [GitHub README](https://github.com/cjhutto/vaderSentiment) — "a lexicon and rule-based sentiment
  analysis tool that is specifically attuned to sentiments expressed in social media, and works well on
  texts from other domains."
- **Install footprint:** wheel is **125,950 bytes (~126 KB)** ([PyPI JSON API](https://pypi.org/pypi/vaderSentiment/json)).
  `setup.py` on the GitHub repo declares `requests` as the only `install_requires` entry, and that is only
  exercised by an optional non-English translation demo, not by the core `SentimentIntensityAnalyzer` API
  ([raw setup.py](https://raw.githubusercontent.com/cjhutto/vaderSentiment/master/setup.py)). No ML
  framework, no model weights to download.
- **CPU latency:** the README documents a rewrite that changed the algorithm's time complexity "from
  something like O(N^4) to O(N)" for speed ([GitHub README](https://raw.githubusercontent.com/cjhutto/vaderSentiment/master/README.rst)).
  No exact per-call millisecond figure is published, but the method is dictionary lookups plus regex/string
  rules over a single sentence — no matrix multiplication, no tokenizer model, no forward pass — so a single
  short text scores in low single-digit milliseconds on any CPU. This is a reasoned inference from the
  documented algorithm, not a cited benchmark number.
- **Output shape:** `polarity_scores()` returns `neg`/`neu`/`pos` ratios plus a single normalized
  **compound** score in `[-1, 1]`. The README's own documented thresholds are compound ≥ 0.05 → positive,
  between −0.05 and 0.05 → neutral, ≤ −0.05 → negative — this maps directly onto the
  POSITIVE/NEUTRAL/NEGATIVE + numeric-score contract the Sentiment service needs, with no extra mapping code.
- **Known limitations for this text type:** the tool and its underlying paper (Hutto & Gilbert, ICWSM-14,
  cited in the README) were built and validated on **social-media microtext** (tweets, product/movie
  reviews), not financial news. The README states the lexicon is "generally applicable to sentiment
  analysis in other domains" but this is an unverified generalization claim, not a finance-specific
  evaluation — no accuracy/F1 numbers for financial or crypto headlines are published anywhere in the
  official docs.

## 2. `distilbert-base-uncased-finetuned-sst-2-english` (generic pretrained checkpoint)

- **What it is:** DistilBERT fine-tuned on SST-2 (movie-review sentiment, GLUE). Confirmed via the
  `transformers` source itself to be the **default model** for the `sentiment-analysis` pipeline alias:
  `SUPPORTED_TASKS["text-classification"]["default"]["model"] == "distilbert/distilbert-base-uncased-finetuned-sst-2-english"`
  ([transformers `pipelines/__init__.py` on GitHub](https://raw.githubusercontent.com/huggingface/transformers/main/src/transformers/pipelines/__init__.py)).
- **Size:** 67M parameters ([model card](https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english)).
  The DistilBERT paper (Sanh et al., 2019, [arXiv:1910.01108](https://arxiv.org/abs/1910.01108)) states
  distillation gives "60% faster" inference and "40%" smaller size than BERT while "retaining 97% of its
  language understanding capabilities."
- **Reported accuracy:** model card lists 91.1% accuracy / F1 0.914 on the SST-2 dev set.
- **Output labels:** **binary only — POSITIVE or NEGATIVE, no NEUTRAL class.** The model card contains no
  neutral label at all, which conflicts directly with the required POSITIVE/NEUTRAL/NEGATIVE output shape;
  a neutral bucket would have to be synthesized post-hoc from confidence thresholds, adding bespoke logic.
- **Documented bias/limitation:** the model card itself flags a fairness problem — it "predicts a different
  proportion of positive labels depending on the sentence" with a country name swapped in, citing "0.89 if
  the country is France, but 0.08 if the country is Afghanistan" for an otherwise identical sentence
  ([model card](https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english)).
- **Domain fit:** trained on movie-review sentences, not financial/crypto text — no headline- or
  news-domain evaluation is documented on the model card.

## 3. `cardiffnlp/twitter-roberta-base-sentiment-latest` (social-media-tuned checkpoint)

- **What it is:** RoBERTa-base pretrained on ~124M tweets (Jan 2018–Dec 2021) and fine-tuned for 3-way
  sentiment on the TweetEval benchmark. Citation: Loureiro et al., *TimeLMs*, 2022
  ([arXiv:2202.03829](https://arxiv.org/abs/2202.03829)) ([model card](https://huggingface.co/cardiffnlp/twitter-roberta-base-sentiment-latest)).
- **Size:** ~125M parameters (standard RoBERTa-base) — roughly double DistilBERT-SST2's parameter count,
  so proportionally slower per-token CPU inference.
- **Output labels:** 3-way — negative / neutral / positive — which does match the service's required label
  set, unlike the plain DistilBERT-SST2 checkpoint.
- **Domain fit:** explicitly a **Twitter/social-media** model — model card preprocessing normalizes
  `@mentions` and URLs the way tweets are written, not financial-news style. No financial or crypto-domain
  evaluation is published.

## 4. `ProsusAI/finbert` (finance-domain checkpoint)

- **What it is:** BERT-base further pretrained on a financial corpus and fine-tuned for 3-class sentiment
  (positive/negative/neutral) on the Financial PhraseBank. Paper: Araci, *FinBERT: Financial Sentiment
  Analysis with Pre-trained Language Models*, 2019 ([arXiv:1908.10063](https://arxiv.org/abs/1908.10063));
  model card at [huggingface.co/ProsusAI/finbert](https://huggingface.co/ProsusAI/finbert).
- **Size:** BERT-base architecture — "12 encoder layers, hidden size of 768, 12 multi-head attention heads
  and 110M parameters in total" (per the paper) — the largest of the three transformer candidates evaluated,
  meaning the highest CPU latency and download footprint of the three.
- **Reported accuracy:** on the Financial PhraseBank test set, the paper reports **0.86 accuracy / 0.84 F1**
  on the full (all-annotator) set, rising to **0.97 accuracy / 0.95 F1** on the subset where all annotators
  fully agreed.
- **Domain fit:** trained on "4,845 English sentences selected randomly from financial news found on the
  LexisNexis database" (per the paper) — single sentences from financial news, which is a close match in
  register and length to crypto news headlines/short articles, unlike either DistilBERT-SST2 (movie
  reviews) or the Cardiff Twitter model (tweets). This is the only candidate with a domain-matched,
  published accuracy number.
- **No inference-speed numbers are published** in the paper; only fine-tuning time is reported (332s for
  last-layer-only fine-tuning), which is irrelevant to this project since no fine-tuning is planned.

## 5. Shared transformer-stack costs (applies to all three HF candidates)

- **`transformers` package** itself is a modest **11.7 MB wheel** ([PyPI](https://pypi.org/project/transformers/)),
  but it does not include a deep-learning backend — the docs show PyTorch as an extra
  (`pip install "transformers[torch]"`) and state "Transformers works with Python 3.10+, and PyTorch 2.5+."
- **PyTorch CPU wheel** is **526.6 MB** (manylinux x86-64, all supported Python versions —
  [PyPI](https://pypi.org/project/torch/)). So the realistic install cost of any HF-pipeline route is
  transformers + torch ≈ **540 MB+**, versus VADER's ~126 KB with no ML framework at all — roughly a
  4,000x difference in install footprint.
- **Documented CPU latency (official HF benchmark, unoptimized/"vanilla" PyTorch path — i.e. what a 2-week
  build would actually ship without adding ONNX/quantization tooling):** Hugging Face's own case study on
  Intel Ice Lake CPUs (2 physical cores, batch size 1) measured vanilla `transformers` DistilBERT-class
  throughput at **~50 req/sec at sequence length 16, i.e. ~20 ms/request**, before any optimization
  ([huggingface.co/blog/infinity-cpu-performance](https://huggingface.co/blog/infinity-cpu-performance)).
  FinBERT (110M params, full BERT-base) and the Cardiff RoBERTa-base model (125M params) are roughly
  1.6–1.9x DistilBERT's parameter count, so expect proportionally higher per-request latency — still
  comfortably sub-100ms per short headline on CPU, but meaningfully slower than DistilBERT and vastly
  slower than VADER's rule-based scoring. Getting below ~10ms would require the ONNX Runtime / Optimum /
  quantization path the docs describe ([transformers CPU inference guide](https://huggingface.co/docs/transformers/main/en/perf_infer_cpu)),
  which is additional tooling and validation work outside a 2-week, no-fine-tuning-budget scope.

---

## Comparison summary

| | VADER | DistilBERT-SST2 | Cardiff Twitter-RoBERTa | FinBERT |
|---|---|---|---|---|
| Install footprint | ~126 KB, 0 ML deps | ~540 MB (`transformers`+`torch`) | ~540 MB | ~540 MB |
| Params | n/a (dictionary) | 67M | 125M | 110M |
| CPU latency / short text | sub-ms (reasoned, not benchmarked) | ~20 ms (documented, unoptimized) | higher than DistilBERT (more params) | higher than DistilBERT (more params) |
| Output labels | 3-way (pos/neu/neg via compound score) | **2-way only, no neutral** | 3-way | 3-way |
| Domain match to crypto news | social media (unverified generalization) | movie reviews | tweets | **financial news sentences** |
| Published accuracy on matching domain | none | 91.1% (SST-2, not financial) | none (Twitter only) | **0.86–0.97 acc on Financial PhraseBank** |
| Setup work in 2 weeks | `pip install`, one function call | model download + pipeline wiring + neutral-threshold hack | model download + pipeline wiring | model download + pipeline wiring |

## Recommendation

**Use VADER (`vaderSentiment`) as the sentiment scorer for the MVP**, with FinBERT flagged as the natural
"swap the implementation" upgrade path later if time and CPU budget allow. The Sentiment service is a
stateless FastAPI process with a single "text in, label+score out" boundary, so the scoring backend is an
internal implementation detail — swapping VADER for FinBERT later doesn't ripple outward to any other
component.

Why VADER fits *this* build specifically:

1. **Zero setup/dependency risk.** A ~126 KB pure-Python package with no required ML dependency installs
   and runs anywhere immediately — no 540 MB PyTorch download, no worrying about CPU wheel availability or
   Docker image bloat for a 4-person team with a 2-week clock and no fine-tuning budget.
2. **Latency is a non-issue.** Rule/dictionary scoring is effectively free per headline; even the
   documented "vanilla," unoptimized transformer path costs ~20ms+ per call plus model load time and
   memory (hundreds of MB resident) — real but unnecessary overhead for what is a background sentiment
   pass over news items, not a latency-critical trading path.
3. **Output shape matches the service contract out of the box.** VADER's compound score plus its own
   documented ±0.05 thresholds give POSITIVE/NEUTRAL/NEGATIVE + a numeric score directly, with no extra
   neutral-bucket logic needed (unlike DistilBERT-SST2, which has no neutral class at all).
4. **Its main weakness — no financial-domain validation — is honestly disclosed, not hidden**, and is
   shared by two of the three transformer alternatives (DistilBERT-SST2 is trained on movie reviews,
   Cardiff-RoBERTa on tweets). Given the assignment is graded on architecture, not model accuracy, and
   sentiment doesn't feed back into strategy signals for the MVP, VADER's domain mismatch is an acceptable,
   well-documented tradeoff rather than a project risk.

**FinBERT is the best transformer candidate if/when accuracy on financial text matters more than setup
cost** — it is the only candidate with a domain-matched, published accuracy figure (0.86–0.97 on Financial
PhraseBank, itself built from financial-news sentences similar in length/register to crypto headlines).
That makes it the recommended target for a later iteration, not the MVP, given the ~540 MB dependency
footprint and the extra work to keep CPU latency acceptable without a GPU or fine-tuning budget.

---

## Sources

- [PyPI: vaderSentiment](https://pypi.org/project/vaderSentiment/)
- [PyPI JSON API: vaderSentiment](https://pypi.org/pypi/vaderSentiment/json)
- [GitHub: cjhutto/vaderSentiment README](https://github.com/cjhutto/vaderSentiment)
- [GitHub raw: vaderSentiment setup.py](https://raw.githubusercontent.com/cjhutto/vaderSentiment/master/setup.py)
- [HuggingFace model card: distilbert-base-uncased-finetuned-sst-2-english](https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english)
- [arXiv:1910.01108 — DistilBERT paper](https://arxiv.org/abs/1910.01108)
- [GitHub raw: transformers pipelines/__init__.py (default model mapping)](https://raw.githubusercontent.com/huggingface/transformers/main/src/transformers/pipelines/__init__.py)
- [HuggingFace model card: cardiffnlp/twitter-roberta-base-sentiment-latest](https://huggingface.co/cardiffnlp/twitter-roberta-base-sentiment-latest)
- [arXiv:2202.03829 — TimeLMs paper](https://arxiv.org/abs/2202.03829)
- [HuggingFace model card: ProsusAI/finbert](https://huggingface.co/ProsusAI/finbert)
- [arXiv:1908.10063 — FinBERT paper](https://arxiv.org/abs/1908.10063)
- [PyPI: transformers](https://pypi.org/project/transformers/)
- [PyPI: torch](https://pypi.org/project/torch/)
- [HuggingFace docs: CPU inference](https://huggingface.co/docs/transformers/main/en/perf_infer_cpu)
- [HuggingFace blog: Millisecond latency using Hugging Face Infinity and modern CPUs](https://huggingface.co/blog/infinity-cpu-performance)
