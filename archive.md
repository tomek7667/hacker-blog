---
layout: page
title: Archive
---

<div class="archive-list">
{% assign postsByYear = site.posts | group_by_exp: "post", "post.date | date: '%Y'" %}
{% for year in postsByYear %}
<h3>{{ year.name }}</h3>
<ul style="list-style: none; padding: 0;">
  {% for post in year.items %}
  <li class="archive-item">
    <div class="archive-item-header">
      <a href="{{ post.url | relative_url }}" class="internal-link">{{ post.title }}</a>
      <time datetime="{{ post.date | date_to_xmlschema }}">{{ post.date | date: "%b %d" }}</time>
    </div>
    {% if post.tags.size > 0 %}
    <div class="tags">
      {% for tag in post.tags limit:3 %}
      <span class="tag">{{ tag }}</span>
      {% endfor %}
    </div>
    {% endif %}
  </li>
  {% endfor %}
</ul>
{% endfor %}
</div>
