(function() {
  var vie;

  vie = new VIE();

  vie.use(new vie.StanbolService({
    url: "http://dev.iks-project.eu:8080",
    proxyDisabled: true
  }));

  jQuery.widget("IKS.vieAutocomplete", {
    options: {
      vie: vie,
      select: function(e, ui) {},
      urifield: null,
      services: "stanbol",
      debug: false,
      depictionProperties: ["foaf:depiction", "schema:thumbnail"],
      labelProperties: ["rdfs:label", "skos:prefLabel", "schema:name", "foaf:name"],
      descriptionProperties: [
        "rdfs:comment", "skos:note", "schema:description", "skos:definition", {
          property: "skos:broader",
          makeLabel: function(propertyValueArr) {
            var labels;
            labels = _(propertyValueArr).map(function(termUri) {
              return termUri.replace(/<.*[\/#](.*)>/, "$1").replace(/_/g, "&nbsp;");
            });
            return "Subcategory of " + (labels.join(', ')) + ".";
          }
        }, {
          property: "dcterms:subject",
          makeLabel: function(propertyValueArr) {
            var labels;
            labels = _(propertyValueArr).map(function(termUri) {
              return termUri.replace(/<.*[\/#](.*)>/, "$1").replace(/_/g, "&nbsp;");
            });
            return "Subject(s): " + (labels.join(', ')) + ".";
          }
        }
      ],
      fallbackLanguage: "en",
      getTypes: function() {
        return [
          {
            uri: "" + this.ns.dbpedia + "Place",
            label: 'Place'
          }, {
            uri: "" + this.ns.dbpedia + "Person",
            label: 'Person'
          }, {
            uri: "" + this.ns.dbpedia + "Organisation",
            label: 'Organisation'
          }, {
            uri: "" + this.ns.skos + "Concept",
            label: 'Concept'
          }
        ];
      },
      getSources: function() {
        return [
          {
            uri: "http://dbpedia.org/resource/",
            label: "dbpedia"
          }, {
            uri: "http://sws.geonames.org/",
            label: "geonames"
          }
        ];
      }
    },
    _create: function() {
      this._logger = this.options.debug ? console : {
        info: function() {},
        warn: function() {},
        error: function() {},
        log: function() {}
      };
      return this._instantiateAutocomplete();
    },
    _instantiateAutocomplete: function() {
      var widget,
        _this = this;
      widget = this;
      return this.element.autocomplete({
        source: function(req, resp) {
          widget._logger.info("req:", req);
          return widget.options.vie.find({
            term: "" + req.term + (req.term.length > 3 ? '*' : '')
          }).using(widget.options.services).execute().fail(function(e) {
            return widget._logger.error("Something wrong happened at stanbol find:", e);
          }).success(function(entityList) {
            var _this = this;
            return _.defer(function() {
              var limit, res;
              widget._logger.info("resp:", _(entityList).map(function(ent) {
                return ent.id;
              }));
              limit = 10;
              entityList = _(entityList).filter(function(ent) {
                if (ent.getSubject().replace(/^<|>$/g, "") === "http://www.iks-project.eu/ontology/rick/query/QueryResultSet") {
                  return false;
                }
                return true;
              });
              res = _(entityList.slice(0, limit)).map(function(entity) {
                return {
                  key: entity.getSubject().replace(/^<|>$/g, ""),
                  label: "" + (widget._getLabel(entity)) + " @ " + (widget._sourceLabel(entity.id)),
                  value: widget._getLabel(entity)
                };
              });
              return resp(res);
            });
          });
        },
        open: function(e, ui) {
          widget._logger.info("autocomplete.open", e, ui);
          if (widget.options.showTooltip) {
            return $(this).data().autocomplete.menu.activeMenu.tooltip({
              items: ".ui-menu-item",
              hide: {
                effect: "hide",
                delay: 50
              },
              show: {
                effect: "show",
                delay: 50
              },
              content: function(response) {
                var uri;
                uri = $(this).data()["item.autocomplete"].getUri();
                widget._createPreview(uri, response);
                return "loading...";
              }
            });
          }
        },
        select: function(e, ui) {
          _this.options.select(e, ui);
          _this._logger.info("autocomplete.select", e.target, ui);
          if (widget.options.urifield) {
            return widget.options.urifield.val(ui.item.key);
          }
        }
      });
    },
    _getUserLang: function() {
      return window.navigator.language.split("-")[0];
    },
    _getDepiction: function(entity, picSize) {
      var depictionUrl, field, fieldValue, preferredFields;
      preferredFields = this.options.depictionProperties;
      field = _(preferredFields).detect(function(field) {
        if (entity.get(field)) return true;
      });
      if (field && (fieldValue = _([entity.get(field)]).flatten())) {
        depictionUrl = _(fieldValue).detect(function(uri) {
          if (uri.indexOf("thumb") !== -1) return true;
        }).replace(/[0-9]{2..3}px/, "" + picSize + "px");
        return depictionUrl;
      }
    },
    _getLabel: function(entity) {
      var preferredFields, preferredLanguages;
      preferredFields = this.options.labelProperties;
      preferredLanguages = [this._getUserLang(), this.options.fallbackLanguage];
      return this._getPreferredLangForPreferredProperty(entity, preferredFields, preferredLanguages);
    },
    _getDescription: function(entity) {
      var preferredFields, preferredLanguages;
      preferredFields = this.options.descriptionProperties;
      preferredLanguages = [this._getUserLang(), this.options.fallbackLanguage];
      return this._getPreferredLangForPreferredProperty(entity, preferredFields, preferredLanguages);
    },
    _getPreferredLangForPreferredProperty: function(entity, preferredFields, preferredLanguages) {
      var label, labelArr, lang, property, valueArr, _i, _j, _len, _len2,
        _this = this;
      for (_i = 0, _len = preferredLanguages.length; _i < _len; _i++) {
        lang = preferredLanguages[_i];
        for (_j = 0, _len2 = preferredFields.length; _j < _len2; _j++) {
          property = preferredFields[_j];
          if (typeof property === "string" && entity.get(property)) {
            labelArr = _.flatten([entity.get(property)]);
            label = _(labelArr).detect(function(label) {
              if (label.indexOf("@" + lang) > -1) return true;
            });
            if (label) return label.replace(/(^\"*|\"*@..$)/g, "");
          } else if (typeof property === "object" && entity.get(property.property)) {
            valueArr = _.flatten([entity.get(property.property)]);
            valueArr = _(valueArr).map(function(termUri) {
              if (termUri.isEntity) {
                return termUri.getSubject();
              } else {
                return termUri;
              }
            });
            return property.makeLabel(valueArr);
          }
        }
      }
      return "";
    },
    _sourceLabel: function(src) {
      var sourceObj, sources;
      if (!src) this._logger.warn("No source");
      if (!src) return "";
      sources = this.options.getSources();
      sourceObj = _(sources).detect(function(s) {
        return src.indexOf(s.uri) !== -1;
      });
      if (sourceObj) {
        return sourceObj.label;
      } else {
        return src.split("/")[2];
      }
    }
  });

}).call(this);
