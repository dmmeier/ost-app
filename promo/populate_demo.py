"""Populate a fresh demo database with rich promotional data.

Usage:
    DATABASE_URL=sqlite:///ost_promo.db uv run python promo/populate_demo.py
"""

import os
import sys

# Force the demo database
os.environ["DATABASE_URL"] = "sqlite:///ost_promo.db"

from ost_core.dependencies import get_tree_service_fresh
from ost_core.models import (
    NodeCreate,
    NodeUpdate,
    ProjectCreate,
    ProjectUpdate,
    TagCreate,
    TagUpdate,
    TreeCreate,
    TreeUpdate,
)
from ost_core.models.project import BubbleTypeDefault

DB_URL = "sqlite:///ost_promo.db"

# Remove old demo DB if it exists
db_path = "ost_promo.db"
if os.path.exists(db_path):
    os.remove(db_path)
    print(f"Removed old {db_path}")

svc = get_tree_service_fresh(DB_URL)
print("Created fresh demo database")


# ──────────────────────────────────────────────────────────────────
# Helper to add a node and return its id
# ──────────────────────────────────────────────────────────────────
def add(tree_id, title, node_type, parent_id=None, **kwargs):
    n = svc.add_node(tree_id, NodeCreate(
        title=title, node_type=node_type, parent_id=parent_id, **kwargs
    ))
    return n.id


# ══════════════════════════════════════════════════════════════════
# PROJECT 1: Acme E-Commerce (Showcase — 3 trees, rich data)
# ══════════════════════════════════════════════════════════════════
p1 = svc.create_project(ProjectCreate(
    name="Acme E-Commerce",
    description="Product discovery for Acme's flagship e-commerce platform. "
                "Serving 2M+ monthly active users across web and mobile.",
    project_context=(
        "Acme E-Commerce is a mid-market B2C platform selling electronics, "
        "home goods, and apparel. Key metrics: $45M ARR, 2.1M MAU, 3.2% "
        "conversion rate (industry avg 2.8%). Main pain points from last "
        "quarter's NPS survey: slow checkout (NPS -12), poor search results "
        "(NPS -8), limited personalization (NPS -5). Strategic goal for "
        "2026: increase repeat purchase rate from 28% to 40%."
    ),
))

# Set custom bubble defaults
svc.update_project(p1.id, ProjectUpdate(
    bubble_defaults={
        "outcome": BubbleTypeDefault(border_color="#3b82f6", border_width=3.0),
        "opportunity": BubbleTypeDefault(border_color="#f97316", border_width=2.0),
        "child_opportunity": BubbleTypeDefault(border_color="#eab308", border_width=2.0),
        "solution": BubbleTypeDefault(border_color="#22c55e", border_width=2.0),
        "experiment": BubbleTypeDefault(border_color="#a855f7", border_width=2.0),
        "kpi": BubbleTypeDefault(border_color="#ef4444", border_width=3.0, label="KPI"),
        "metric": BubbleTypeDefault(border_color="#06b6d4", border_width=2.0, label="Metric"),
    }
))

# ── Tags for P1 ──
tag_validated = svc.create_tag(p1.id, TagCreate(name="Validated", color="#22c55e", fill_style="solid", font_light=True))
tag_risky = svc.create_tag(p1.id, TagCreate(name="High Risk", color="#ef4444", fill_style="solid", font_light=True))
tag_q2 = svc.create_tag(p1.id, TagCreate(name="Q2 2026", color="#3b82f6"))
tag_q3 = svc.create_tag(p1.id, TagCreate(name="Q3 2026", color="#8b5cf6"))
tag_data = svc.create_tag(p1.id, TagCreate(name="Data-driven", color="#06b6d4"))
tag_ux = svc.create_tag(p1.id, TagCreate(name="UX Research", color="#ec4899"))

# ── TREE 1: Customer Retention Strategy (complex, ~25 nodes) ──
t1 = svc.create_tree(TreeCreate(
    name="Customer Retention Strategy",
    description="Improving repeat purchase rate from 28% to 40%",
    tree_context=(
        "Focus: Why do customers not come back? Interview data from 47 customers, "
        "analytics from 6 months of cohort data. Key insight: 62% of one-time buyers "
        "never return after first purchase. Churn peaks at day 14 post-purchase."
    ),
    project_id=p1.id,
))

# Root: Outcome
outcome = add(t1.id, "Increase repeat purchase rate from 28% to 40%", "outcome",
              description="Core business outcome for 2026. Current repeat rate 28%, industry benchmark 35-45%.")

# Opportunity 1: Post-purchase experience
opp1 = add(t1.id, "Post-purchase experience feels impersonal and forgettable", "opportunity",
           parent_id=outcome,
           assumption="Customers who feel engaged post-purchase are 3x more likely to return",
           evidence="Cohort analysis shows customers who open post-purchase emails have 42% repeat rate vs 18% for non-openers")
svc.add_tag_to_node(opp1, tag_validated.id)

# Child opportunities under Opp1
co1_1 = add(t1.id, "Order confirmation lacks personalization", "child_opportunity",
            parent_id=opp1,
            assumption="Generic order confirmations miss an engagement opportunity",
            evidence="A/B test data from Q4 2025: personalized emails had 2.1x higher click-through")
svc.add_tag_to_node(co1_1, tag_data.id)

co1_2 = add(t1.id, "No follow-up after delivery", "child_opportunity",
            parent_id=opp1,
            assumption="The silence after delivery creates a gap in the customer relationship",
            evidence="Survey: 71% of customers say they 'forget about us' within 2 weeks")
svc.add_tag_to_node(co1_2, tag_ux.id)

# Solutions under co1_1
sol1_1_1 = add(t1.id, "Personalized order recap with recommendations", "solution",
               parent_id=co1_1,
               assumption="Cross-sell recommendations at confirmation will drive returns",
               evidence="Similar e-commerce sites see 15-20% lift from confirmation page recs")
svc.add_tag_to_node(sol1_1_1, tag_q2.id)

exp1_1_1_1 = add(t1.id, "A/B test: recommendation carousel in confirmation email", "experiment",
                 parent_id=sol1_1_1,
                 assumption="We can measure recommendation click-through within 2 weeks",
                 evidence="Email platform supports dynamic content blocks; 50k sample size needed")
svc.add_tag_to_node(exp1_1_1_1, tag_q2.id)

# Solutions under co1_2
sol1_2_1 = add(t1.id, "7-day post-delivery check-in sequence", "solution",
               parent_id=co1_2,
               assumption="A timely check-in rebuilds the connection before the customer forgets us")
svc.add_tag_to_node(sol1_2_1, tag_q2.id)

exp1_2_1_1 = add(t1.id, "Pilot: automated check-in for electronics category", "experiment",
                 parent_id=sol1_2_1,
                 assumption="Electronics buyers are more likely to need support, making check-ins valuable")

sol1_2_2 = add(t1.id, "Review request with incentive program", "solution",
               parent_id=co1_2,
               assumption="Asking for reviews re-engages customers and builds habit")

exp1_2_2_1 = add(t1.id, "Test: 5% discount coupon with review request", "experiment",
                 parent_id=sol1_2_2,
                 assumption="The discount will pay for itself through repeat purchases")
svc.add_tag_to_node(exp1_2_2_1, tag_risky.id)

# Opportunity 2: Search and discovery
opp2 = add(t1.id, "Customers can't find products they'd actually want to buy again", "opportunity",
           parent_id=outcome,
           assumption="Poor product discovery is a key driver of non-return",
           evidence="Exit surveys: 34% cite 'couldn't find what I wanted' as reason for not returning")

co2_1 = add(t1.id, "Search results don't learn from purchase history", "child_opportunity",
            parent_id=opp2,
            assumption="Personalized search would surface more relevant products")
svc.add_tag_to_node(co2_1, tag_data.id)

sol2_1_1 = add(t1.id, "ML-powered search personalization", "solution",
               parent_id=co2_1,
               assumption="We can build a collaborative filtering model with existing purchase data")
svc.add_tag_to_node(sol2_1_1, tag_q3.id)
svc.add_tag_to_node(sol2_1_1, tag_risky.id)

exp2_1_1_1 = add(t1.id, "Prototype: category affinity model on 3-month cohort", "experiment",
                 parent_id=sol2_1_1,
                 assumption="3 months of data is sufficient to build meaningful affinity scores")

co2_2 = add(t1.id, "No 'browse by mood/occasion' feature", "child_opportunity",
            parent_id=opp2,
            assumption="Occasion-based browsing would inspire repeat purchases for gifting etc.")
svc.add_tag_to_node(co2_2, tag_ux.id)

sol2_2_1 = add(t1.id, "Curated collections by occasion", "solution",
               parent_id=co2_2,
               assumption="Manual curation is good enough for an MVP; AI can come later")

exp2_2_1_1 = add(t1.id, "Launch 5 curated collections, measure engagement", "experiment",
                 parent_id=sol2_2_1,
                 assumption="We can create compelling collections with existing merchandising team")
svc.add_tag_to_node(exp2_2_1_1, tag_q2.id)

# Opportunity 3: Loyalty
opp3 = add(t1.id, "No reason to choose us over competitors for repeat purchases", "opportunity",
           parent_id=outcome,
           assumption="Customers are price-shopping between us and competitors every time",
           evidence="Competitive analysis: 4 of 5 top competitors have loyalty programs; we don't")
svc.add_tag_to_node(opp3, tag_validated.id)

sol3_1 = add(t1.id, "Points-based loyalty program", "solution",
             parent_id=opp3,
             assumption="A loyalty program will create switching costs and drive repeat visits")
svc.add_tag_to_node(sol3_1, tag_q3.id)

exp3_1_1 = add(t1.id, "Soft-launch loyalty MVP with early adopter cohort (500 users)", "experiment",
               parent_id=sol3_1,
               assumption="500 users is enough to validate engagement patterns before full rollout")

sol3_2 = add(t1.id, "Exclusive member-only flash sales", "solution",
             parent_id=opp3,
             assumption="Scarcity and exclusivity will drive repeat visits")

exp3_2_1 = add(t1.id, "Run 3 flash sales for registered users, measure return rate", "experiment",
               parent_id=sol3_2,
               assumption="Flash sales won't cannibalize full-price revenue significantly")
svc.add_tag_to_node(exp3_2_1, tag_risky.id)

# Apply some style overrides for visual interest
svc.update_node(outcome, NodeUpdate(override_fill_color="#dbeafe", override_fill_style="solid"))
svc.update_node(opp1, NodeUpdate(edge_thickness=4))
svc.update_node(opp2, NodeUpdate(edge_thickness=2))
svc.update_node(opp3, NodeUpdate(edge_thickness=3))
svc.update_node(sol2_1_1, NodeUpdate(override_fill_color="#fef3c7", override_fill_style="solid"))
svc.update_node(exp1_2_2_1, NodeUpdate(override_border_color="#dc2626", override_border_width=3.0))

print(f"  Tree 1: Customer Retention Strategy — created with {len(svc.get_full_tree(t1.id).nodes)} nodes")


# ── TREE 2: Mobile App Redesign (medium, ~14 nodes) ──
t2 = svc.create_tree(TreeCreate(
    name="Mobile App Redesign",
    description="Improving mobile conversion and engagement",
    tree_context=(
        "Mobile app has 800k MAU but only 1.8% conversion rate (vs 3.2% web). "
        "App store rating dropped from 4.2 to 3.7 in last 6 months. Top complaints: "
        "slow loading, confusing navigation, checkout crashes on older devices."
    ),
    project_id=p1.id,
))

m_outcome = add(t2.id, "Improve mobile conversion from 1.8% to 3.0%", "outcome",
                description="Close the gap between mobile and web conversion rates")

m_opp1 = add(t2.id, "App performance causes cart abandonment", "opportunity",
             parent_id=m_outcome,
             assumption="Slow load times directly correlate with cart abandonment",
             evidence="Firebase analytics: 40% of sessions with >3s load time end in abandonment")
svc.add_tag_to_node(m_opp1, tag_validated.id)
svc.add_tag_to_node(m_opp1, tag_data.id)

m_co1_1 = add(t2.id, "Product images load slowly on 4G", "child_opportunity",
              parent_id=m_opp1,
              assumption="Image optimization alone could cut load times significantly")

m_sol1 = add(t2.id, "Implement progressive image loading + WebP", "solution",
             parent_id=m_co1_1,
             assumption="WebP format will reduce payload by 30-50% without quality loss")

m_exp1 = add(t2.id, "A/B test WebP vs current JPEG on product pages", "experiment",
             parent_id=m_sol1,
             assumption="We can measure load time improvement within 1 week")
svc.add_tag_to_node(m_exp1, tag_q2.id)

m_co1_2 = add(t2.id, "Checkout crashes on Android 10 and below", "child_opportunity",
              parent_id=m_opp1,
              assumption="Legacy Android support is causing disproportionate issues",
              evidence="Crashlytics: 78% of checkout crashes are on Android 10 or older")

m_sol2 = add(t2.id, "Rebuild checkout with progressive enhancement", "solution",
             parent_id=m_co1_2,
             assumption="A simpler checkout fallback for old devices will prevent crashes")

m_opp2 = add(t2.id, "Navigation is confusing — users can't find categories", "opportunity",
             parent_id=m_outcome,
             assumption="Simplified navigation will reduce friction and increase browsing depth",
             evidence="Session recordings show avg 4.2 navigation taps to reach a product (web: 2.1)")
svc.add_tag_to_node(m_opp2, tag_ux.id)

m_sol3 = add(t2.id, "Bottom navigation bar with smart category shortcuts", "solution",
             parent_id=m_opp2,
             assumption="Bottom nav is more thumb-friendly and follows mobile UX best practices")

m_exp3 = add(t2.id, "Prototype test with 20 users: bottom nav vs current hamburger", "experiment",
             parent_id=m_sol3,
             assumption="20 users is enough for a qualitative usability test")
svc.add_tag_to_node(m_exp3, tag_ux.id)

m_opp3 = add(t2.id, "No offline browsing capability", "opportunity",
             parent_id=m_outcome,
             assumption="Users in low-connectivity areas give up on our app")

m_sol4 = add(t2.id, "Service worker with offline product cache", "solution",
             parent_id=m_opp3,
             assumption="Caching recently viewed products offline retains browsing context")

m_exp4 = add(t2.id, "PWA pilot: cache last 50 viewed products", "experiment",
             parent_id=m_sol4,
             assumption="50 products covers 90% of return browse sessions")

svc.update_node(m_outcome, NodeUpdate(override_fill_color="#dbeafe", override_fill_style="solid"))
svc.update_node(m_opp1, NodeUpdate(edge_thickness=5))

print(f"  Tree 2: Mobile App Redesign — created with {len(svc.get_full_tree(t2.id).nodes)} nodes")


# ── TREE 3: Checkout Conversion (multi-root: KPI → Outcome → tree) ──
t3 = svc.create_tree(TreeCreate(
    name="Checkout Conversion Optimization",
    description="Reducing cart abandonment and improving checkout flow",
    tree_context=(
        "Cart abandonment rate: 72% (industry avg: 69%). Checkout funnel analysis "
        "shows biggest drop-off at shipping options (28% drop) and payment page (18% drop). "
        "Guest checkout already available but poorly promoted."
    ),
    project_id=p1.id,
))

# Multi-root: KPI node at top level
kpi_root = add(t3.id, "P&L Impact: +$3.2M revenue from checkout improvements", "kpi",
               description="Based on current AOV of $67 and projected 4,800 additional monthly conversions")
svc.update_node(kpi_root, NodeUpdate(
    override_fill_color="#fef2f2", override_fill_style="solid",
    override_border_color="#ef4444", override_border_width=3.0
))

# Metric node
metric = add(t3.id, "Reduce cart abandonment from 72% to 65%", "metric",
             parent_id=kpi_root,
             assumption="Each 1% reduction in abandonment = ~$450k annual revenue")
svc.update_node(metric, NodeUpdate(
    override_fill_color="#ecfeff", override_fill_style="solid",
    override_border_color="#06b6d4", override_border_width=2.0
))

# Outcome
c_outcome = add(t3.id, "Make checkout fast, clear, and trustworthy", "outcome",
                parent_id=metric,
                description="Users should feel confident and efficient at every step")

c_opp1 = add(t3.id, "Shipping costs are a surprise at checkout", "opportunity",
             parent_id=c_outcome,
             assumption="Unexpected costs are the #1 reason for cart abandonment",
             evidence="Baymard Institute: 48% of abandonments cite 'extra costs too high'")
svc.add_tag_to_node(c_opp1, tag_validated.id)

c_sol1 = add(t3.id, "Show shipping estimate on product page", "solution",
             parent_id=c_opp1,
             assumption="Early transparency reduces surprise and builds trust")
svc.add_tag_to_node(c_sol1, tag_q2.id)

c_exp1 = add(t3.id, "A/B test: shipping calculator on PDP vs current flow", "experiment",
             parent_id=c_sol1,
             assumption="We can isolate the impact on checkout completion within 2 weeks")

c_sol2 = add(t3.id, "Free shipping threshold with progress bar", "solution",
             parent_id=c_opp1,
             assumption="Gamifying the shipping threshold increases AOV and reduces abandonment")

c_exp2 = add(t3.id, "Test $75 free shipping threshold with progress indicator", "experiment",
             parent_id=c_sol2,
             assumption="$75 threshold balances margin impact with conversion lift")

c_opp2 = add(t3.id, "Payment options are limited", "opportunity",
             parent_id=c_outcome,
             assumption="Customers expect their preferred payment method to be available",
             evidence="Support tickets: 12% mention 'payment method not available'")

c_sol3 = add(t3.id, "Add Apple Pay and Google Pay", "solution",
             parent_id=c_opp2,
             assumption="Mobile wallet users convert at higher rates due to speed")
svc.add_tag_to_node(c_sol3, tag_q2.id)

c_exp3 = add(t3.id, "Launch Apple Pay on iOS, measure checkout time reduction", "experiment",
             parent_id=c_sol3,
             assumption="Checkout time will drop by 40%+ for Apple Pay users")

c_opp3 = add(t3.id, "Guest checkout is hidden behind account creation", "opportunity",
             parent_id=c_outcome,
             assumption="Forced account creation causes abandonment at the last step")

c_sol4 = add(t3.id, "Make guest checkout the default, account creation optional", "solution",
             parent_id=c_opp3,
             assumption="Guest default + optional save will satisfy both segments")

c_exp4 = add(t3.id, "Reverse the flow: guest first with 'save for later' prompt", "experiment",
             parent_id=c_sol4,
             assumption="Account creation won't drop since we still offer it post-purchase")

# Add some edge thickness variations
svc.update_node(c_opp1, NodeUpdate(edge_thickness=5))
svc.update_node(c_opp2, NodeUpdate(edge_thickness=3))
svc.update_node(c_opp3, NodeUpdate(edge_thickness=2))

print(f"  Tree 3: Checkout Conversion — created with {len(svc.get_full_tree(t3.id).nodes)} nodes")


# ══════════════════════════════════════════════════════════════════
# PROJECT 2: Enterprise SaaS Onboarding
# ══════════════════════════════════════════════════════════════════
p2 = svc.create_project(ProjectCreate(
    name="Enterprise SaaS Onboarding",
    description="Improving time-to-value for enterprise customers",
    project_context="B2B SaaS platform with 200+ enterprise clients. Avg onboarding: 45 days.",
))

t_saas = svc.create_tree(TreeCreate(
    name="Onboarding Time-to-Value",
    description="Reducing onboarding from 45 to 21 days",
    project_id=p2.id,
))
s_out = add(t_saas.id, "Reduce enterprise onboarding from 45 to 21 days", "outcome")
s_o1 = add(t_saas.id, "Configuration is too complex for admins", "opportunity", parent_id=s_out,
           assumption="Simplifying config would remove the biggest bottleneck")
s_s1 = add(t_saas.id, "Guided setup wizard with templates", "solution", parent_id=s_o1)
s_o2 = add(t_saas.id, "Training takes too long for end users", "opportunity", parent_id=s_out,
           assumption="Interactive onboarding could replace live training sessions")
s_s2 = add(t_saas.id, "In-app interactive tutorials", "solution", parent_id=s_o2)

print(f"  Project 2: SaaS Onboarding — {len(svc.get_full_tree(t_saas.id).nodes)} nodes")


# ══════════════════════════════════════════════════════════════════
# PROJECT 3: Healthcare Portal Redesign
# ══════════════════════════════════════════════════════════════════
p3 = svc.create_project(ProjectCreate(
    name="Healthcare Portal Redesign",
    description="Patient portal for scheduling, records, and communication",
    project_context="Regional health system with 500k patients. Portal adoption at 22%.",
))

t_health = svc.create_tree(TreeCreate(
    name="Portal Adoption Strategy",
    description="Increasing patient portal adoption from 22% to 50%",
    project_id=p3.id,
))
h_out = add(t_health.id, "Increase portal adoption from 22% to 50%", "outcome")
h_o1 = add(t_health.id, "Patients don't know the portal exists", "opportunity", parent_id=h_out)
h_s1 = add(t_health.id, "Post-visit SMS with portal activation link", "solution", parent_id=h_o1)
h_o2 = add(t_health.id, "Appointment scheduling is easier by phone", "opportunity", parent_id=h_out)
h_s2 = add(t_health.id, "Redesign scheduling with 3-click flow", "solution", parent_id=h_o2)

print(f"  Project 3: Healthcare Portal — {len(svc.get_full_tree(t_health.id).nodes)} nodes")


# ══════════════════════════════════════════════════════════════════
# PROJECT 4: FinTech Payment Gateway
# ══════════════════════════════════════════════════════════════════
p4 = svc.create_project(ProjectCreate(
    name="FinTech Payment Gateway",
    description="Developer-focused payment API platform",
    project_context="Processing $2B annually. 1,200 merchant integrations. API-first approach.",
))

t_fin = svc.create_tree(TreeCreate(
    name="Developer Experience Improvements",
    description="Making integration faster and easier for developers",
    project_id=p4.id,
))
f_out = add(t_fin.id, "Reduce average integration time from 14 to 3 days", "outcome")
f_o1 = add(t_fin.id, "API documentation is incomplete and outdated", "opportunity", parent_id=f_out)
f_s1 = add(t_fin.id, "Interactive API playground with live examples", "solution", parent_id=f_o1)
f_o2 = add(t_fin.id, "Testing payments requires production-like setup", "opportunity", parent_id=f_out)
f_s2 = add(t_fin.id, "Sandbox environment with realistic test data", "solution", parent_id=f_o2)

print(f"  Project 4: FinTech Gateway — {len(svc.get_full_tree(t_fin.id).nodes)} nodes")


# ══════════════════════════════════════════════════════════════════
# PROJECT 5: EdTech Learning Platform
# ══════════════════════════════════════════════════════════════════
p5 = svc.create_project(ProjectCreate(
    name="EdTech Learning Platform",
    description="Online learning platform for professional development",
    project_context="250k active learners. Course completion rate: 18%. Avg session: 12 min.",
))

t_edu = svc.create_tree(TreeCreate(
    name="Course Completion Rate",
    description="Improving completion from 18% to 35%",
    project_id=p5.id,
))
e_out = add(t_edu.id, "Increase course completion rate from 18% to 35%", "outcome")
e_o1 = add(t_edu.id, "Courses are too long for busy professionals", "opportunity", parent_id=e_out)
e_s1 = add(t_edu.id, "Micro-learning: 5-minute daily modules", "solution", parent_id=e_o1)
e_o2 = add(t_edu.id, "No sense of progress or achievement", "opportunity", parent_id=e_out)
e_s2 = add(t_edu.id, "Gamification: badges, streaks, and milestones", "solution", parent_id=e_o2)

print(f"  Project 5: EdTech Platform — {len(svc.get_full_tree(t_edu.id).nodes)} nodes")


# ══════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════
projects = svc.list_projects()
print(f"\n✓ Created {len(projects)} projects:")
for p in projects:
    trees = svc.list_trees(p.id)
    print(f"  - {p.name}: {len(trees)} tree(s)")

print(f"\nDemo database ready at: {db_path}")
