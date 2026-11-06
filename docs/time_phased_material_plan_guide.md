# Time-Phased Material Plan: Product Owner Guide

## Purpose

The **Time-Phased Material Plan** shows, for each plant and material, how much stock the planning engine expects to have at the end of each future time bucket. It also shows the quantity it recommends ordering in a bucket and whether the order needs to be released immediately to meet the plan.

Use it to answer: **“Will this plant have enough of this material in each future week, and what order should be released to avoid going below its minimum stock?”**

This is a planning recommendation. A number shown as an order does not by itself mean that a purchase order has been created or sent to a supplier.

## Reading the table

Each row is one **plant + material** combination. For example, `P_AGR · PK-BAG-45` means the 45 kg cement bag material at plant `P_AGR`. The unit is the material's unit of measure: bags may be counted as `each`, ink as `kg`, and raw materials as `ton`.

| Column | Meaning |
| --- | --- |
| **Plant** | Site whose stock and requirements are being planned. |
| **Material** | Material code. Select the chevron beside it to open the detailed requirement rows. |
| **Description / Category** | Human-readable material name and grouping, where displayed. |
| **On Hand** | Starting stock quantity supplied to the plan for the selected plant and material. |
| **Min / Max** | Configured minimum stock (the level the plan protects) and maximum/capacity reference. The calculation uses the minimum as its replenishment trigger. The maximum is also checked for a capacity alert; it is not used to cap the order quantity in the calculation described below. |
| **W0, W+1, …** | Consecutive future time buckets. `W0` is the first week; `W+1` is the next week. The date underneath is that bucket's start date. The dashboard in the supplied screenshot shows weekly buckets and 14 buckets in total. |

Horizontal scrolling reveals later buckets. The dashboard's month selector controls the planning horizon. A bucket is a summary for its period; expand the row to see the requirement and release detail.

## What appears inside a time bucket

The **large bold value** is the projected stock remaining at the end of the bucket, after that bucket's requirements, scheduled receipts, and recommended planned order are accounted for.

The smaller blue `+N order` label is the planned order quantity for that bucket. It is shown separately so the planner can see how much supply is being recommended. It is not an additional quantity to add a second time to the bold projected stock: the bold value already includes it.

The red **Expedite** label means the calculated order release date is on or before the first bucket's date. In practical terms, the order needs attention at the start of the displayed planning horizon. It does not necessarily mean that the order is late as of today's date. Check the expanded **Planned Order Release** date and the material lead time.

The **Capacity** label means the projected stock exceeds the configured maximum capacity for that material/site. It calls for review of order timing, quantity, or capacity settings.

## How the calculation works

For each plant, material, and time bucket, the engine performs this sequence:

1. **Gross requirement**: calculates material demand from planned production/forecast and the bill of materials (including configured component scrap), then totals demand in the bucket.
2. **Scheduled receipts**: adds known inbound supply due in the bucket. Opening scheduled receipts are included in the first bucket when provided. Dated inbound/transit rows are assigned to their due-date bucket.
3. **Stock before a new planned order**: opening/projected stock + scheduled receipts − gross requirement.
4. **Net requirement**: the quantity needed to bring stock back to the configured minimum: `max(0, minimum stock − stock before planned order)`.
5. **Planned order**: zero when net requirement is zero; otherwise the greater of net requirement and the configured minimum order quantity (MOQ).
6. **Projected inventory**: stock before the planned order + planned order quantity.
7. **Release timing**: the order is moved earlier by the configured lead time. If its release date is on/before the first bucket date, the bucket is marked **Expedite**.

In compact form:

```text
stock_before_order = opening/projected_stock + scheduled_receipts - gross_requirement
net_requirement    = max(0, minimum_stock - stock_before_order)
planned_order      = 0, if net_requirement = 0
                     otherwise max(net_requirement, MOQ)
projected_stock    = stock_before_order + planned_order
```

The current engine's planned-order quantity rule applies MOQ; it does not round to an order multiple. The configured maximum is used for the capacity alert and does not currently cap the planned order. If the business expects order multiples or a hard maximum, those policies should be confirmed against the approved planning template and implemented explicitly.

## Worked example from the screenshot: P_AGR · PK-BAG-45, W0

The screenshot shows:

- Starting on-hand stock: **60,000**
- Minimum stock: **50,000**
- W0 planned order: **30,000**
- W0 projected stock: **79,993**
- An **Expedite** label

Assuming W0 has no scheduled receipts, the values imply gross demand of approximately **10,007** units in W0:

```text
60,000 starting stock - 10,007 demand + 30,000 planned order = 79,993 projected stock
```

Before the planned order, stock would be `60,000 − 10,007 = 49,993`, which is **7 below** the 50,000 minimum. A 7-unit net requirement is smaller than the material's **30,000 MOQ**, so the plan recommends a 30,000-unit order. Adding that order produces 79,993 projected stock. The red **Expedite** flag says the order's release date, after applying lead time, falls on or before W0's date.

This is a reconstruction from the visible screenshot, not a substitute for the exact detail rows. Expand `PK-BAG-45` and read **Gross Requirements**, **Scheduled Receipts**, **Net Requirements**, **Projected Inventory**, and **Planned Order Release** to confirm the exact inputs used for the live row.

## Understanding the expanded detail

Selecting the chevron next to a material exposes the calculation components by bucket:

| Detail row | How to interpret it |
| --- | --- |
| **Gross Requirements** | Total material demand in the bucket before considering stock or incoming supply. |
| **Scheduled Receipts** | Supply already expected to arrive in the bucket, including dated in-transit receipts. |
| **Net Requirements** | Shortfall against minimum stock after demand and known receipts are considered, before a new order is added. |
| **Projected Inventory** | Expected end-of-bucket stock after the planned order is included. This matches the bold value in the main row. |
| **Planned Order Release** | Date the order should be released after allowing for lead time. Compare it with W0 to understand an **Expedite** marker. |

## How to review an unexpectedly large order

If the plan shows a large `+N order`, review these inputs in order:

1. Expand the row and check whether **Gross Requirements** are plausible for that week.
2. Check the forecast/production plan and the material's bill-of-material quantity and unit conversions.
3. Confirm that starting on-hand stock and dated scheduled receipts were uploaded for the correct plant/material and units.
4. Check the minimum stock, MOQ, lead time, scrap percentage, and maximum capacity in master data/constraints.
5. Compare **Net Requirements** with the displayed order. If the net need is small but order is large, MOQ may be driving the quantity. If projected stock exceeds maximum, investigate the capacity warning and supply policy.

For example, the screenshot shows repeated large orders for `PK-BAG-50` while projected stock is held at 50,000. This means the plan is replenishing back to the minimum after each period's demand, with the order size affected by the current inputs and MOQ. Confirm the bag demand/BOM ratio, units, and MOQ if those order quantities are not expected.

## Product owner review checklist

- Confirm the selected planning month and the bucket dates.
- Confirm the plant and material codes match the intended site and item.
- Check that **On Hand** matches the uploaded opening balance.
- Expand any row with an order, expedite marker, or capacity warning.
- Verify gross demand, receipts, net requirement, projected stock, and release date against the approved planning assumptions.
- Treat the display as a recommendation for review; complete the normal purchasing approval process before creating or releasing an actual purchase order.

## Demo data note

The values in a demo may come from sample inputs and are intended to demonstrate the planning flow. They should not be used as real procurement instructions. Before an operational decision, use approved demand, inventory, master data, and supplier lead-time inputs, then validate the results with the planning owner.
