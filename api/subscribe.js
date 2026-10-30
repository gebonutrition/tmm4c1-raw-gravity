export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const { phone, email } = req.body || {};

    if (email !== undefined) {

      if (typeof email !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Invalid email"
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
      ) {
        return res.status(400).json({
          ok: false,
          error: "Invalid email address"
        });
      }

      const apiKey =
        process.env.KLAVIYO_PRIVATE_API_KEY;

      if (!apiKey) {
        return res.status(500).json({
          ok: false,
          error: "Klaviyo API key is not configured"
        });
      }

      const emailResponse = await fetch(
        "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs",
        {
          method: "POST",

          headers: {
            Authorization: `Klaviyo-API-Key ${apiKey}`,
            Accept: "application/vnd.api+json",
            "Content-Type": "application/vnd.api+json",
            Revision: "2026-10-15"
          },

          body: JSON.stringify({
            data: {
              type: "profile-subscription-bulk-create-job",

              attributes: {
                custom_source: "Raw Gravity landing page",
                historical_import: false,

                profiles: {
                  data: [
                    {
                      type: "profile",

                      attributes: {
                        email: normalizedEmail,

                        subscriptions: {
                          email: {
                            marketing: {
                              consent: "SUBSCRIBED"
                            }
                          }
                        }
                      }
                    }
                  ]
                }
              },

              relationships: {
                list: {
                  data: {
                    type: "list",
                    id: "THM6M5"
                  }
                }
              }
            }
          })
        }
      );

      const emailResponseText =
        await emailResponse.text();

      let emailResult = null;

      try {
        emailResult = JSON.parse(emailResponseText);
      } catch {
        emailResult = null;
      }

      if (!emailResponse.ok) {
        console.error(
          "Klaviyo email subscription error:",
          emailResponse.status,
          emailResponseText
        );

        return res.status(502).json({
          ok: false,
          error: "Email subscription failed"
        });
      }

      return res.status(200).json({
        ok: true
      });
    }

    if (typeof phone !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Phone is required"
      });
    }

    let digits = phone.replace(/\D/g, "");

    if (
      digits.length === 11 &&
      digits.startsWith("1")
    ) {
      digits = digits.slice(1);
    }

    if (digits.length !== 10) {
      return res.status(400).json({
        ok: false,
        error: "Invalid US phone number"
      });
    }

    const phoneNumber = `+1${digits}`;

    const headers = {
      Authorization:
        `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Revision: "2026-07-15"
    };


    /*
     * STEP 1
     * Create or update profile.
     * NO SMS SUBSCRIPTION.
     */
    const profileResponse = await fetch(
      "https://a.klaviyo.com/api/profile-import",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "profile",
            attributes: {
              phone_number: phoneNumber
            }
          }
        })
      }
    );

    const profileData =
      await profileResponse.json().catch(() => null);

    if (!profileResponse.ok) {
      console.error(
        "Klaviyo profile error:",
        profileData
      );

      return res.status(profileResponse.status).json({
        ok: false,
        error:
          profileData?.errors?.[0]?.detail ||
          "Klaviyo profile creation failed"
      });
    }


    const profileId =
      profileData?.data?.id;

    if (!profileId) {
      return res.status(500).json({
        ok: false,
        error: "Klaviyo profile ID not returned"
      });
    }


    /*
     * STEP 2
     * Add existing profile to tmm4 list.
     * Does NOT change subscription status.
     */
    const listResponse = await fetch(
      "https://a.klaviyo.com/api/lists/THM6M5/relationships/profiles",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: [
            {
              type: "profile",
              id: profileId
            }
          ]
        })
      }
    );

    const listText =
      await listResponse.text();

    if (!listResponse.ok) {
      console.error(
        "Klaviyo list error:",
        listResponse.status,
        listText
      );

      return res.status(listResponse.status).json({
        ok: false,
        error:
          "Profile created, but could not be added to list"
      });
    }


    console.log(
      "Klaviyo profile created/updated:",
      profileId
    );

    console.log(
      "Klaviyo profile added to list:",
      "THM6M5"
    );


    return res.status(200).json({
      ok: true,
      profileId
    });

  } catch (error) {

    console.error(
      "Klaviyo server error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}